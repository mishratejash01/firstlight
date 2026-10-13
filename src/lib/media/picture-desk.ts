import "server-only";

import { cosine, embedTexts } from "@/lib/engine/embeddings";
import {
  commonsCategoryImages,
  commonsImage,
  commonsLogo,
  commonsSearchTitles,
  commonsThumb,
  findWikidataItem,
  looksLikeSymbol,
  wikidataUrl,
  type WikidataMatch,
} from "@/lib/engine/wikidata";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import { judgePictures, type JudgeCandidate, type JudgeStory, type StoryKind } from "./judge";
import { mapsConfigured, placeMap } from "./map";
import { searchLicensedImages, type LicensedImage } from "./openverse";
import { searchPexels } from "./pexels";

/**
 * The picture desk.
 *
 * Gathers every plausible picture for a story at once — verified portraits
 * and institutions from Wikidata and their Commons categories, a company's
 * mark where a mark is right, scenes from Commons, Openverse and Pexels for
 * the writer's briefs — drops what the site ran in the last week, keeps the
 * ten most promising, and hands them to the judge (lib/media/judge), which
 * looks at them beside the story and chooses one or none. Nothing is chosen
 * by title alone, and nothing is chosen because it was the only thing left.
 *
 * When the judge says none: a map of the place for an incident, otherwise
 * the caller's typographic card. When the judge cannot be reached, the
 * caller falls back to the old search ladder. Every decision is recorded in
 * picture_decisions with its candidates and scores.
 */

export type Subject = { name: string; type: string };

export type DeskInput = {
  headline: string;
  standfirst?: string | null;
  section: string;
  subjects: Subject[];
  related: Subject[];
  /** The writer's scene and its alternatives, best first. */
  briefs: string[];
  terms: string | null;
};

export type Candidate = {
  image: LicensedImage;
  thumbUrl: string;
  role: "portrait" | "building" | "logo" | "scene";
  claim: string;
  source: string;
  subject?: string;
  qid?: string;
};

export type DeskOutcome = {
  /** What was decided: a picture, a map, a card, nothing fit, or the judge could not be reached. */
  outcome: "photo" | "logo" | "map" | "card" | "none" | "unjudged";
  chosen: Candidate | null;
  caption: string | null;
  decisionId: string | null;
  sameAs: { name: string; url: string }[];
};

type Supabase = ReturnType<typeof createAdminClient>;

const LOGO_TYPES = new Set(["Organization", "Corporation", "SportsTeam", "Brand"]);
const MAX_CANDIDATES = 10;
const MAX_SCENES = 7;
const MAX_PORTRAITS = 3;
const RECENT_DAYS = 7;
/** Commons titles that name a person are not scenes; official libraries title portraits like this. */
const PERSON_TITLE =
  /\b(minister|ministry|secretary|president|chairman|chairperson|commissioner|governor|director|officer|chief|ceo|md|mla|mp|shri|smt|dr|mr|mrs|ms|sir|hon|addressing|addresses|meeting|meets|inaugurat|felicitat|press conference|with the)\b/i;

/** Resolves to `fallback` when `work` has not finished in time; the work itself is left to finish unobserved. */
function withBudget<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** How long each gathering stage may take; the judge gets the rest of the caller's budget. */
const SUBJECTS_BUDGET_MS = 28_000;
const SCENES_BUDGET_MS = 28_000;

async function readSetting<T>(supabase: Supabase, key: string, fallback: T): Promise<T> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

/** What sort of story this is, for the rules that depend on it. */
export function storyKind(headline: string, section: string, subjects: Subject[]): StoryKind {
  const h = headline.toLowerCase();
  const sec = section.toLowerCase();
  if (/\b(derail|crash|fire|blast|flood|collaps|shot dead|shot at|killed|dies|dead|accident|earthquake|cyclone|landslide|rescue|stampede|explosion)\b/.test(h)) return "incident";
  if (/\b(accus|slams?|dares?|row\b|clash|alleg|attack|protest|spat|hits out|lashes|blames?|mocks?|rebuke|demands? resignation)/.test(h)) return "conflict";
  if (sec === "justice" || /\b(court|supreme court|high court|tribunal|judge|bench|plea|petition|verdict|bail|fir\b)/.test(h)) return "court";
  if ((sec === "business" || sec === "startups") && /\b(sensex|nifty|stocks?|shares?|rupee|markets?|ipo|bse|nse|equit)/.test(h)) return "market";
  if (subjects[0]?.type === "Person" && /\b(says|said|calls|urges|vows|announces|tells|warns|denies|claims|backs|hails|promises|seeks)\b/.test(h)) return "statement";
  return "general";
}

/** The paper is Indian: a story is set in India unless it is filed under World or Conflict. */
function isAbroad(section: string): boolean {
  const sec = section.toLowerCase();
  return sec === "world" || sec === "conflict";
}

const INDIAN =
  /\b(india|indian|delhi|mumbai|bengaluru|bangalore|chennai|kolkata|hyderabad|pune|ahmedabad|kerala|tamil nadu|karnataka|maharashtra|gujarat|punjab|haryana|bihar|odisha|assam|telangana|andhra pradesh|rajasthan|uttar pradesh|madhya pradesh|west bengal|goa|jharkhand|chhattisgarh|uttarakhand|himachal pradesh|jammu|kashmir|ladakh|nagaland|manipur|mizoram|tripura|meghalaya|sikkim|arunachal pradesh)\b/i;

/** A place in an Indian story must be in India: "Mon" is a district of Nagaland, not Montenegro. */
function placeFitsStory(match: WikidataMatch, abroad: boolean): boolean {
  if (abroad) return true;
  return INDIAN.test(`${match.label} ${match.description ?? ""}`);
}

function thumbOf(image: LicensedImage): string {
  if (image.thumbUrl) return image.thumbUrl;
  if (image.provider === "wikimedia_commons") return commonsThumb(image.url);
  return image.url;
}

/** Pictures the site ran in the last week, by their source, so the same file does not come round again. */
async function recentlyUsed(supabase: Supabase): Promise<Set<string>> {
  const since = new Date(Date.now() - RECENT_DAYS * 86400_000).toISOString();
  const { data } = await supabase.from("media_assets").select("source_url").gte("created_at", since).not("source_url", "is", null).limit(2000);
  return new Set((data ?? []).map((row) => row.source_url as string));
}

async function subjectCandidates(
  subjects: Subject[],
  headline: string,
  kind: StoryKind,
  abroad: boolean,
  sameAs: { name: string; url: string }[],
): Promise<{ candidates: Candidate[]; places: { name: string; match: WikidataMatch }[] }> {
  const candidates: Candidate[] = [];
  const places: { name: string; match: WikidataMatch }[] = [];
  const named = subjects.map((s) => ({ name: s.name.trim(), type: s.type })).filter((s) => s.name.length > 2).slice(0, 4);

  const matches = await Promise.all(named.map((subject) => findWikidataItem(subject.name, subject.type, headline).catch(() => null)));
  const resolved = named
    .map((subject, i) => ({ subject, match: matches[i] }))
    .filter((entry): entry is { subject: Subject; match: WikidataMatch } => Boolean(entry.match))
    .filter((entry) => entry.subject.type !== "Place" || placeFitsStory(entry.match, abroad));
  for (const { subject, match } of resolved) {
    sameAs.push({ name: subject.name, url: wikidataUrl(match.qid) });
    if (subject.type === "Place") places.push({ name: subject.name, match });
  }
  // Every subject's pictures at once: Wikipedia's own, the Commons category, the mark.
  const fetched = await Promise.all(
    resolved.map(async ({ subject, match }, i) => {
      const isPerson = subject.type === "Person";
      const wantsMore = isPerson || subject.type === "GovernmentOrganization" || subject.type === "Place";
      const wantsLogo = LOGO_TYPES.has(subject.type) && kind !== "conflict" && kind !== "incident" && kind !== "court" && i < 2;
      const [own, more, logo] = await Promise.all([
        match.imageFile ? commonsImage(match.imageFile).catch(() => null) : Promise.resolve(null),
        wantsMore ? commonsCategoryImages(match.qid, isPerson ? 3 : 2).catch(() => [] as LicensedImage[]) : Promise.resolve([] as LicensedImage[]),
        wantsLogo ? commonsLogo(match.qid).catch(() => null) : Promise.resolve(null),
      ]);
      return { subject, match, own, more, logo };
    }),
  );
  for (const { subject, match, own, more, logo } of fetched) {
    const isPerson = subject.type === "Person";
    const role: Candidate["role"] = isPerson ? "portrait" : "building";
    const describe = match.description ? `${match.label}, ${match.description}` : match.label;
    if (own) {
      candidates.push({
        image: own,
        thumbUrl: thumbOf(own),
        role,
        source: "Wikimedia Commons",
        subject: match.label,
        qid: match.qid,
        claim: isPerson ? `verified portrait of ${describe}` : `${describe}: Wikipedia's own picture, usually the building or the place itself`,
      });
    }
    {
      for (const image of more) {
        if (own && image.url === own.url) continue;
        candidates.push({
          image,
          thumbUrl: thumbOf(image),
          role,
          source: "Wikimedia Commons",
          subject: match.label,
          qid: match.qid,
          claim: isPerson ? `a photograph filed under ${describe} on Commons (should be the same person; check)` : `a photograph filed under ${describe} on Commons`,
        });
      }
    }
    // A company's mark, only where a mark can be right.
    if (logo) {
      candidates.push({ image: logo, thumbUrl: thumbOf(logo), role: "logo", source: "Wikimedia Commons", subject: match.label, qid: match.qid, claim: `logo of ${describe}` });
    }
  }
  return { candidates, places };
}

async function sceneCandidates(
  briefs: string[],
  terms: string | null,
  places: string[],
  abroad: boolean,
  errors: string[],
): Promise<Candidate[]> {
  const plainTerms = (terms ?? "")
    .toLowerCase()
    .split(/[,;/]/)
    .map((term) => term.replace(/[^a-z0-9 ]/g, " ").trim())
    .filter((term) => term.length > 2)
    .slice(0, 2);
  const queries: string[] = [];
  const add = (q: string) => {
    const clean = q.trim();
    if (clean && !queries.includes(clean)) queries.push(clean);
  };
  for (const term of plainTerms) add(term);
  for (const brief of briefs.slice(0, 3)) add(brief.replace(/[."']/g, "").toLowerCase());
  if (places[0] && plainTerms[0]) add(`${places[0]} ${plainTerms[0]}`);
  if (!abroad && plainTerms[0] && !/india/i.test(plainTerms[0])) add(`${plainTerms[0]} india`);
  // The scene's two most telling words, for libraries that index single nouns.
  const core = (briefs[0] ?? "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 4 && !/^(with|from|inside|outside|during|their|there|where|which|while|about|under|above|front|behind)$/.test(word))
    .slice(0, 2);
  if (core.length === 2) add(core.join(" "));

  const found: Candidate[] = [];
  const seen = new Set<string>();
  const consider = (image: LicensedImage, source: string) => {
    const key = (image.sourceUrl ?? image.url).toLowerCase();
    if (seen.has(key)) return;
    if (!image.title || looksLikeSymbol(image.title) || PERSON_TITLE.test(image.title)) return;
    if (/dall[·-]?e|midjourney|stable diffusion|ai[- ]generated/i.test(image.title)) return;
    seen.add(key);
    found.push({ image, thumbUrl: thumbOf(image), role: "scene", source, claim: `a library picture titled "${image.title}"` });
  };

  const commonsTitles: string[] = [];
  const note = (source: string, query: string) => (error: unknown) => {
    errors.push(`${source} "${query}": ${error instanceof Error ? error.message.slice(0, 80) : "failed"}`);
    return [] as never[];
  };
  // Openverse allows few anonymous requests a minute, so it gets the two best
  // queries; Commons and Pexels take all of them.
  await Promise.all(
    queries.slice(0, 6).map(async (query, i) => {
      const [titles, stock, pexels] = await Promise.all([
        commonsSearchTitles(query, 5).catch(note("commons", query)),
        i < 2 ? searchLicensedImages(query, 5).catch(note("openverse", query)) : Promise.resolve([]),
        searchPexels(query, 6).catch(note("pexels", query)),
      ]);
      for (const title of titles) if (!commonsTitles.includes(title)) commonsTitles.push(title);
      for (const image of stock) consider(image, "Openverse");
      for (const image of pexels) consider(image, "Pexels");
    }),
  );

  // Commons search returns file names only; rank them by meaning against the
  // writer's scene before paying for each one's details.
  if (commonsTitles.length && briefs[0]) {
    const cleaned = commonsTitles.map((file) => file.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " "));
    const vectors = await embedTexts([briefs[0], ...cleaned]).catch(() => [] as (number[] | null)[]);
    const target = vectors[0];
    const ranked = cleaned
      .map((title, i) => ({ file: commonsTitles[i], title, score: target && vectors[i + 1] ? cosine(target, vectors[i + 1] as number[]) : 0 }))
      .filter((entry) => !looksLikeSymbol(entry.title) && !PERSON_TITLE.test(entry.title))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    const details = await Promise.all(ranked.map((entry) => commonsImage(entry.file).catch(() => null)));
    for (const image of details) if (image) consider(image, "Wikimedia Commons");
  }
  return found;
}

/** The scenes most like the writer's brief, by title, so the judge sees the best few rather than the first few. */
async function rankScenes(scenes: Candidate[], brief: string | undefined, limit: number): Promise<Candidate[]> {
  if (scenes.length <= limit || !brief) return scenes.slice(0, limit);
  const vectors = await embedTexts([brief, ...scenes.map((c) => c.image.title ?? "")]).catch(() => [] as (number[] | null)[]);
  const target = vectors[0];
  if (!target) return scenes.slice(0, limit);
  return scenes
    .map((candidate, i) => ({ candidate, score: vectors[i + 1] ? cosine(target, vectors[i + 1] as number[]) : 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

/**
 * The pictures an Indian paper reaches for when a story has no subject of its
 * own to photograph: the exchanges for a market story, the Supreme Court for
 * a court story that names no other court. Resolved through Wikidata like
 * any subject, so they are the real places, and offered to the judge as
 * candidates rather than chosen outright.
 */
const HOUSE_PICKS: { kinds: StoryKind[]; qid: string; label: string; when?: RegExp }[] = [
  { kinds: ["market"], qid: "Q638398", label: "Bombay Stock Exchange" },
  { kinds: ["market"], qid: "Q638740", label: "National Stock Exchange of India" },
  { kinds: ["market"], qid: "Q5166965", label: "Dalal Street" },
  { kinds: ["market", "general", "statement"], qid: "Q944085", label: "Reserve Bank of India", when: /\brbi\b|reserve bank/i },
  { kinds: ["court", "conflict", "general"], qid: "Q213380", label: "Supreme Court of India", when: /supreme court|\bsc\b|apex court/i },
  { kinds: ["general", "statement", "conflict"], qid: "Q695252", label: "Parliament of India", when: /parliament|lok sabha|rajya sabha/i },
];

async function housePicks(kind: StoryKind, headline: string, abroad: boolean, used: Set<string>): Promise<Candidate[]> {
  if (abroad) return [];
  const picks = HOUSE_PICKS.filter((pick) => pick.kinds.includes(kind) && (!pick.when || pick.when.test(headline))).slice(0, 3);
  const out: Candidate[] = [];
  await Promise.all(
    picks.map(async (pick) => {
      const images = await commonsCategoryImages(pick.qid, 3).catch(() => [] as LicensedImage[]);
      for (const image of images) {
        if (used.has(image.sourceUrl ?? "") || used.has(image.url)) continue;
        out.push({ image, thumbUrl: thumbOf(image), role: "building", source: "Wikimedia Commons", subject: pick.label, qid: pick.qid, claim: `${pick.label}: a photograph from its Commons category, the usual picture for this kind of story` });
      }
    }),
  );
  return out.slice(0, 4);
}

/** Records the article a decision ended up illustrating. */
export async function linkPictureDecision(decisionId: string | null | undefined, articleId: string): Promise<void> {
  if (!decisionId) return;
  const supabase = createAdminClient();
  await supabase.from("picture_decisions").update({ article_id: articleId }).eq("id", decisionId);
}

/**
 * Chooses a picture for a story. `publish` copies the chosen image into the
 * site's own library and returns what the caller files on the article.
 */
export async function pictureDesk<T>(
  input: DeskInput,
  publish: (image: LicensedImage, alt: string, options?: { pad?: boolean }) => Promise<T | null>,
): Promise<DeskOutcome & { illustration: T | null }> {
  const supabase = createAdminClient();
  const started = Date.now();
  const sameAs: { name: string; url: string }[] = [];
  const kind = storyKind(input.headline, input.section, input.subjects);
  const placeNames = [...input.subjects, ...input.related]
    .filter((s) => s.type === "Place")
    .map((s) => s.name.trim())
    .filter((name, i, all) => name.length > 2 && all.indexOf(name) === i)
    .slice(0, 3);
  const abroad = isAbroad(input.section);
  const sceneErrors: string[] = [];
  const briefs = input.briefs.map((b) => b.trim()).filter((b) => b.split(/\s+/).length >= 2 && b.length <= 120);

  const t0 = Date.now();
  const [{ candidates: fromSubjects, places }, scenes, used] = await Promise.all([
    withBudget(subjectCandidates(input.subjects, input.headline, kind, abroad, sameAs), SUBJECTS_BUDGET_MS, { candidates: [] as Candidate[], places: [] as { name: string; match: WikidataMatch }[] }),
    withBudget(sceneCandidates(briefs, input.terms, placeNames, abroad, sceneErrors), SCENES_BUDGET_MS, [] as Candidate[]),
    withBudget(recentlyUsed(supabase), 8_000, new Set<string>()),
  ]);
  const gatheredMs = Date.now() - t0;
  const trace: Record<string, unknown> = {
    gatheredMs,
    briefs,
    terms: input.terms,
    places: placeNames,
    abroad,
    subjects: input.subjects.slice(0, 4),
    fromSubjects: fromSubjects.length,
    scenes: scenes.length,
    scenesBySource: Object.fromEntries(["Wikimedia Commons", "Openverse", "Pexels"].map((src) => [src, scenes.filter((c) => c.source === src).length])),
    recentlyUsed: used.size,
    sceneErrors,
  };

  const fresh = (c: Candidate) => !used.has(c.image.sourceUrl ?? "") && !used.has(c.image.url);
  const house = await withBudget(housePicks(kind, input.headline, abroad, used), 15_000, [] as Candidate[]);
  trace.housePicks = house.length;
  const portraits = fromSubjects.filter((c) => c.role === "portrait" && fresh(c)).slice(0, MAX_PORTRAITS);
  const logos = fromSubjects.filter((c) => c.role === "logo").slice(0, 1);
  const buildings = [...fromSubjects.filter((c) => c.role === "building" && fresh(c)).slice(0, 2), ...house];
  const bestScenes = await rankScenes(scenes.filter(fresh), briefs[0], MAX_SCENES);
  const pool = [...portraits, ...logos, ...buildings, ...bestScenes].slice(0, MAX_CANDIDATES);
  trace.pool = pool.length;
  trace.droppedAsRecent = [...fromSubjects, ...scenes].filter((c) => !fresh(c)).length;

  const record = async (
    outcome: DeskOutcome["outcome"],
    reason: string,
    judgedBy: string | null,
    scored: Record<string, unknown>[],
    chosen: Candidate | null,
  ): Promise<string | null> => {
    const { data } = await supabase
      .from("picture_decisions")
      .insert({
        headline: input.headline,
        section: input.section,
        story_kind: kind,
        outcome,
        reason,
        judged_by: judgedBy,
        candidates: scored as unknown as Json,
        chosen: chosen ? { role: chosen.role, source: chosen.source, title: chosen.image.title, url: chosen.image.url, thumb: chosen.thumbUrl, claim: chosen.claim } : null,
        ms: Date.now() - started,
        trace: trace as unknown as Json,
      })
      .select("id")
      .maybeSingle();
    return data?.id ?? null;
  };

  const describeAll = (scores?: Map<number, Record<string, unknown>>) =>
    pool.map((c, i) => ({
      index: i + 1,
      role: c.role,
      source: c.source,
      title: c.image.title,
      thumb: c.thumbUrl,
      claim: c.claim,
      ...(scores?.get(i + 1) ?? {}),
    }));

  const fallbackMap = async (why: string, judgedBy: string | null, scored: Record<string, unknown>[]): Promise<DeskOutcome & { illustration: T | null }> => {
    const place = places[0];
    if (mapsConfigured() && place && (kind === "incident" || kind === "general" || kind === "court")) {
      const map = await placeMap({ name: place.match.label, qid: place.match.qid, description: place.match.description }).catch(() => null);
      if (map) {
        const illustration = await publish(map, `Map: ${place.match.label}`);
        if (illustration) {
          const decisionId = await record("map", `${why} A map of ${place.match.label} instead.`, judgedBy, scored, null);
          return { outcome: "map", chosen: null, caption: `Map: ${place.match.label}`, decisionId, sameAs, illustration };
        }
      }
    }
    const decisionId = await record("card", `${why} No map available; the card.`, judgedBy, scored, null);
    return { outcome: "card", chosen: null, caption: null, decisionId, sameAs, illustration: null };
  };

  if (!pool.length) return fallbackMap("No candidate picture was found.", null, []);

  const cap = await readSetting<number>(supabase, "picture_judge_daily_cap", 500);
  const { count } = await supabase
    .from("picture_decisions")
    .select("id", { count: "exact", head: true })
    .not("judged_by", "is", null)
    .gte("created_at", new Date(Date.now() - 86400_000).toISOString());
  if ((count ?? 0) >= cap) {
    const decisionId = await record("unjudged", "The day's judge calls are used up.", null, describeAll(), null);
    return { outcome: "unjudged", chosen: null, caption: null, decisionId, sameAs, illustration: null };
  }

  const story: JudgeStory = {
    headline: input.headline,
    standfirst: input.standfirst ?? null,
    section: input.section,
    kind,
    subjects: input.subjects.slice(0, 4),
    briefs,
    places: placeNames,
    abroad,
  };
  const judgeInput: JudgeCandidate[] = pool.map((c, i) => ({ index: i + 1, thumbUrl: c.thumbUrl, source: c.source, title: c.image.title, claim: c.claim }));

  let judgement: Awaited<ReturnType<typeof judgePictures>>;
  const t1 = Date.now();
  try {
    judgement = await judgePictures(story, judgeInput);
    trace.judgeMs = Date.now() - t1;
    trace.seen = judgement.seen;
    trace.thumbsFailed = judgement.unseen.map((index) => ({ index, thumb: pool[index - 1]?.thumbUrl }));
  } catch (error) {
    console.warn("[pictures] judge unavailable:", error instanceof Error ? error.message.slice(0, 160) : error);
    const decisionId = await record("unjudged", "The judge could not be reached.", null, describeAll(), null);
    return { outcome: "unjudged", chosen: null, caption: null, decisionId, sameAs, illustration: null };
  }

  const minScore = await readSetting<number>(supabase, "picture_min_score", 7);
  const scores = new Map<number, Record<string, unknown>>();
  for (const v of judgement.judgement.verdicts) scores.set(v.index, { relevance: v.relevance, misleading: v.misleading, cliche: v.cliche, setting: v.setting, quality: v.quality, textHeavy: v.textHeavy, synthetic: v.synthetic, note: v.note });
  const scored = describeAll(scores);
  const by = judgement.modelId;

  const choice = judgement.judgement.choice;
  const chosen = choice >= 1 && choice <= pool.length ? pool[choice - 1] : null;
  const verdict = chosen ? judgement.judgement.verdicts.find((v) => v.index === choice) : null;
  const passes =
    chosen &&
    verdict &&
    !verdict.misleading &&
    !verdict.synthetic &&
    !verdict.textHeavy &&
    verdict.quality >= 5 &&
    verdict.relevance >= (verdict.cliche ? Math.max(minScore, 9) : minScore) &&
    !(chosen.role === "logo" && (kind === "conflict" || kind === "incident")) &&
    !(verdict.setting === "elsewhere" && !abroad && chosen.role === "scene");

  if (!passes) {
    const why = chosen && verdict ? `The judge's pick (${choice}) did not clear the bar: ${judgement.judgement.reason}` : `The judge chose none: ${judgement.judgement.reason}`;
    return fallbackMap(why, by, scored);
  }

  const caption = judgement.judgement.caption?.trim() || (chosen.role === "scene" ? `${briefs[0] ?? chosen.image.title} (file image)` : (chosen.subject ?? chosen.image.title ?? input.headline));
  const illustration = await publish(chosen.image, chosen.role === "logo" ? `${chosen.subject} logo` : caption, { pad: chosen.role === "logo" });
  if (!illustration) return fallbackMap("The chosen picture could not be copied.", by, scored);
  const decisionId = await record(chosen.role === "logo" ? "logo" : "photo", judgement.judgement.reason, by, scored, chosen);
  return { outcome: chosen.role === "logo" ? "logo" : "photo", chosen, caption, decisionId, sameAs, illustration };
}
