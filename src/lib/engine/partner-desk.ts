import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { slugify, withUniqueSuffix } from "@/lib/format/slug";
import { illustrateArticle } from "@/lib/media/illustrate";
import {
  briefPictureFor,
  draftPartnerArticle,
  gatePartnerCandidates,
  PARTNER_PICTURE_MIN_SCORE,
  PARTNER_PICTURE_POLICY,
  type GateCandidate,
  type GateVerdict,
  type PartnerSource,
} from "@/lib/ai/partner-draft";
import {
  articleUrl,
  fetchArticle,
  fetchCategories,
  houseAuthorId,
  karostartupConfigured,
  PARTNER,
  postArticle,
  recentTitles,
  slugTaken,
  updateArticle,
  uploadCover,
} from "@/lib/partners/karostartup";
import { gatherDocuments, loadAuthority } from "./write";

/**
 * The partner desk: ten stories a day for karostartup.com, chosen from what
 * the engine already knows is moving, written in the partner's voice, with a
 * cover in the partner's Cloudinary, posted into the partner's own backend.
 *
 * One pass writes at most one story. The scheduler calls it every twenty
 * minutes; the spacing rule below spreads the day's ten across the waking
 * hours, and a breaking story may jump the queue. Every pass, kept or not,
 * leaves its reasoning in partner_posts.
 */

const TIME_ZONE = "Asia/Kolkata";
/** Stories a day, counted on the partner's clock. */
const DEFAULT_DAILY_CAP = 10;
/** Minutes between two posts, unless the next one is breaking. */
const DEFAULT_GAP_MINUTES = 45;
/** The desk's day: nothing posts in the small hours, when nobody reads it. */
const OPEN_FROM_MINUTES = 6 * 60 + 30;
const OPEN_UNTIL_MINUTES = 23 * 60 + 30;
/** Only events the engine first saw within this many hours are candidates: the desk posts news, not follow-ups. */
const CANDIDATE_WINDOW_HOURS = 18;
/** A story whose newest source was published longer ago than this is stale, whatever the engine's clock says. */
const STALE_SOURCE_HOURS = 30;
/** In the ranking, every this-many hours of age costs a story one point against heat and fit. */
const FRESHNESS_HOURS = 6;
/** Candidates the gate reads in one call. */
const GATE_BATCH = 12;
/** Source documents fetched for the chosen story: many of the beat's outlets sit behind walls, so try several. */
const MAX_DOCUMENTS = 7;
const MIN_DOCUMENT_CHARS = 500;
/** Their desk averages about 780 words; a draft under this left facts out. */
const MIN_WORDS = 600;
/** How often the picture desk looks for a cover for one story: once when it is posted, once more later. */
const MAX_COVER_TRIES = 2;
/** A breaking story is one still hours old. */
const BREAKING_MAX_HOURS = 3;
/** The gate's bar: below this the story is not theirs. */
const MIN_FIT = 7;

/** Words that mark the startup beat, before the gate spends a model call. */
const STARTUP_WORDS =
  /\b(startup|start-up|founder|co-founder|venture|vc|seed|series [a-f]\b|pre-series|funding|raises|raised|valuation|unicorn|soonicorn|ipo|dpiit|acqui|acquisition|acquires|merger|investors?|angel|accelerator|y combinator|incubator|saas|fintech|edtech|healthtech|agritech|deeptech|climate tech|d2c|quick commerce|e-commerce|ecommerce|marketplace|neobank|payments|upi|lending|insurtech|proptech|mobility|ev\b|electric vehicle|battery|drone|spacetech|ai startup|foundation model|layoffs?|shuts? down|pivot|gig|zomato|swiggy|zepto|blinkit|paytm|phonepe|razorpay|cred|meesho|ola|flipkart|byju|physicswallah|lenskart|nykaa|groww|zerodha|upstox|openai|anthropic|sequoia|peak xv|accel|lightspeed|tiger global|softbank|nexus|elevation|blume|kalaari|matrix|3one4|stride|a16z|andreessen|khosla|temasek|prosus|naspers)\b/i;

/** Outlets whose stories are the beat by definition. */
const STARTUP_OUTLETS = [
  "inc42",
  "yourstory",
  "entrackr",
  "techcrunch",
  "crunchbase",
  "sifted",
  "techinasia",
  "medianama",
  "techfundingnews",
  "tech.eu",
  "officechai",
  "venturebeat",
  "saastr",
  "ycombinator",
  "startupstorymedia",
];

type EventRow = {
  id: string;
  title: string;
  summary: string | null;
  entities: string[] | null;
  source_keys: string[] | null;
  mention_count: number | null;
  score: number | null;
  first_seen_at: string;
  last_seen_at: string;
  status: string;
  triage_section: string | null;
  urgency: string | null;
};

export type PartnerDeskReport = {
  partner: string;
  outcome: "posted" | "skipped" | "paused" | "nothing" | "failed" | "planned";
  reason?: string;
  postedToday: number;
  cap: number;
  candidates?: number;
  gated?: number;
  chosen?: { eventId: string; title: string; verdict: GateVerdict } | null;
  queue?: { eventId: string; title: string; fit: number; heat: number; hoursOld: number; breaking: boolean }[];
  posted?: { slug: string; url: string; headline: string; kicker: string; category: string; breaking: boolean };
  /** A cover found for an earlier story, when the pass had nothing to post. */
  cover?: CoverReport;
  durationMs: number;
};

export type CoverReport = { slug: string; outcome: "covered" | "none" | "has-cover" | "unknown" | "failed"; url?: string; reason?: string };

/** What the picture desk needs to revisit a story, kept in the post's trace. */
type PictureInputs = {
  subjects: { name: string; type: string }[];
  related: { name: string; type: string }[];
  brief: string | null;
  terms: string | null;
  alternatives: string[];
};

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
  return data?.value === null || data?.value === undefined ? fallback : (data.value as T);
}

/** Minutes since midnight and the start of today, on the partner's clock. */
function partnerClock(now: Date): { minutes: number; dayStart: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = Number(get("hour")) % 24;
  const minutes = hour * 60 + Number(get("minute"));
  const dayStart = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00+05:30`);
  return { minutes, dayStart };
}

function hoursSince(iso: string, now: number): number {
  return Math.max(0, (now - new Date(iso).getTime()) / 3600_000);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function looksLikeStartupBeat(event: EventRow): boolean {
  const text = [event.title, event.summary ?? "", ...(event.entities ?? [])].join(" ");
  if (STARTUP_WORDS.test(text)) return true;
  const keys = (event.source_keys ?? []).join(" ").toLowerCase();
  return STARTUP_OUTLETS.some((outlet) => keys.includes(outlet));
}

/** Rough sameness of two headlines: the share of a shorter one's words found in the other. */
function titleOverlap(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared / Math.min(wa.size, wb.size);
}

async function record(row: {
  event_id: string | null;
  headline: string;
  status: "written" | "published" | "failed" | "skipped";
  category?: string | null;
  kicker?: string | null;
  slug?: string | null;
  remote_id?: string | null;
  is_breaking?: boolean;
  cover_url?: string | null;
  reason?: string | null;
  model_id?: string | null;
  trace?: Json;
  published_at?: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("partner_posts").insert({ partner: PARTNER, ...row });
  if (error) console.error("[partner-desk] could not record", error.message);
}

/**
 * The picture desk's choice for one of their stories, copied straight into their Cloudinary
 * under the story's slug. A real photograph or nothing: never our typographic card.
 */
async function findCover(
  headline: string,
  standfirst: string | null,
  picture: PictureInputs,
  slug: string,
): Promise<{ url: string; caption: string } | null> {
  const illustration = await illustrateArticle({
    upload: async (source, options) => {
      const url = await uploadCover(source, slug, options);
      return url ? { url } : null;
    },
    headline,
    standfirst,
    section: "startups",
    subjects: picture.subjects,
    related: picture.related,
    brief: picture.brief,
    terms: picture.terms,
    alternatives: picture.alternatives,
    relevantOnly: true,
    policy: PARTNER_PICTURE_POLICY,
    minScore: PARTNER_PICTURE_MIN_SCORE,
  });
  if (illustration?.kind !== "photo") return null;
  return { url: illustration.url, caption: illustration.credit ? `${illustration.alt} (${illustration.credit})` : illustration.alt };
}

/** Finds a cover for a story already posted without one, and files it on their article. */
export async function coverPartnerPost(slug: string): Promise<CoverReport> {
  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("partner_posts")
    .select("id, trace")
    .eq("partner", PARTNER)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();
  if (!row) return { slug, outcome: "unknown", reason: "no published post with that slug" };
  const article = await fetchArticle(slug);
  if (!article) return { slug, outcome: "unknown", reason: "not found on the partner's site" };
  if (article.cover_image_url) return { slug, outcome: "has-cover", url: article.cover_image_url };

  const trace = (row.trace && typeof row.trace === "object" && !Array.isArray(row.trace) ? row.trace : {}) as Record<string, unknown>;
  let picture = trace.picture as PictureInputs | undefined;
  if (!picture) {
    // Posted before the desk kept its picture brief: ask for one from the story itself.
    const brief = await briefPictureFor({ headline: article.title, standfirst: article.subtitle, summary: article.summary });
    picture = { subjects: brief.subjects, related: [], brief: brief.imageBrief, terms: brief.imageSearchTerms, alternatives: brief.imageAlternatives };
  }
  const tries = Number(trace.coverTries ?? 0) + 1;
  const cover = await findCover(article.title, article.subtitle, picture, slug);
  await supabase
    .from("partner_posts")
    .update({ cover_url: cover?.url ?? null, trace: { ...trace, picture, coverTries: tries } as Json })
    .eq("id", row.id);
  if (!cover) return { slug, outcome: "none", reason: "the picture desk found no photograph" };
  await updateArticle(article.id, { cover_image_url: cover.url, cover_caption: cover.caption });
  return { slug, outcome: "covered", url: cover.url };
}

/** One of the last day's stories still without a cover, tried again; at most once per pass. */
async function backfillOneCover(now: Date): Promise<CoverReport | null> {
  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from("partner_posts")
    .select("slug, trace")
    .eq("partner", PARTNER)
    .eq("status", "published")
    .is("cover_url", null)
    .gte("published_at", new Date(now.getTime() - 86400_000).toISOString())
    .order("published_at", { ascending: false })
    .limit(20);
  const next = (rows ?? []).find((row) => {
    const trace = (row.trace ?? {}) as Record<string, unknown>;
    return row.slug && Number(trace.coverTries ?? 0) < MAX_COVER_TRIES;
  });
  if (!next?.slug) return null;
  try {
    return await coverPartnerPost(next.slug);
  } catch (error) {
    return { slug: next.slug, outcome: "failed", reason: (error as Error).message };
  }
}

export async function runPartnerDesk(options: { dry?: boolean; eventId?: string; now?: boolean } = {}): Promise<PartnerDeskReport> {
  const started = Date.now();
  const report = await pass(options);
  // A pass that posted nothing uses its time to find covers for stories that went out without one.
  if (!options.dry && !options.eventId && report.outcome !== "posted" && report.outcome !== "paused") {
    const cover = await backfillOneCover(new Date());
    if (cover) report.cover = cover;
    report.durationMs = Date.now() - started;
  }
  return report;
}

async function pass(options: { dry?: boolean; eventId?: string; now?: boolean }): Promise<PartnerDeskReport> {
  const started = Date.now();
  const supabase = createAdminClient();
  const cap = await readSetting<number>("partner_karostartup_daily_cap", DEFAULT_DAILY_CAP);
  const base = (outcome: PartnerDeskReport["outcome"], extra: Partial<PartnerDeskReport> = {}): PartnerDeskReport => ({
    partner: PARTNER,
    outcome,
    postedToday: 0,
    cap,
    durationMs: Date.now() - started,
    ...extra,
  });

  if (!karostartupConfigured()) return base("paused", { reason: "karostartup backend not configured" });
  const enabled = await readSetting<boolean>("partner_karostartup_enabled", true);
  if (!enabled) return base("paused", { reason: "partner_karostartup_enabled is off" });

  const now = new Date();
  const clock = partnerClock(now);
  const { data: today } = await supabase
    .from("partner_posts")
    .select("published_at")
    .eq("partner", PARTNER)
    .eq("status", "published")
    .gte("published_at", clock.dayStart.toISOString())
    .order("published_at", { ascending: false });
  const postedToday = today?.length ?? 0;
  const lastAt = today?.[0]?.published_at ? new Date(today[0].published_at).getTime() : 0;
  const gapMinutes = await readSetting<number>("partner_karostartup_gap_minutes", DEFAULT_GAP_MINUTES);
  // An administrator's "now" waives the spacing and the hours, never the cap or the gate.
  const gapOpen = Boolean(options.now) || now.getTime() - lastAt >= gapMinutes * 60_000;
  const deskOpen = Boolean(options.now) || (clock.minutes >= OPEN_FROM_MINUTES && clock.minutes <= OPEN_UNTIL_MINUTES);

  // A dry run only looks, so the cap and the hours do not stop it.
  if (!options.eventId && !options.dry) {
    if (postedToday >= cap) return base("skipped", { postedToday, reason: `today's ${cap} are posted` });
    if (!deskOpen) return base("skipped", { postedToday, reason: "outside the desk's hours" });
  }

  // Candidates: what the engine first saw lately, minus what this desk has handled. An old
  // story that is still collecting mentions is not new, so the window is on first sight.
  const since = new Date(now.getTime() - CANDIDATE_WINDOW_HOURS * 3600_000).toISOString();
  let query = supabase
    .from("story_events")
    .select("id, title, summary, entities, source_keys, mention_count, score, first_seen_at, last_seen_at, status, triage_section, urgency")
    .gte("first_seen_at", since)
    .in("status", ["candidate", "newsworthy", "writing", "written"])
    .order("score", { ascending: false })
    .limit(80);
  if (options.eventId) query = supabase.from("story_events").select("id, title, summary, entities, source_keys, mention_count, score, first_seen_at, last_seen_at, status, triage_section, urgency").eq("id", options.eventId);
  const { data: events, error: eventsError } = await query;
  if (eventsError) return base("failed", { postedToday, reason: eventsError.message });

  // Handled: posted, failed, or turned away. A story the gate turned away is offered again
  // after six hours, in case the day has changed; a stale one is never offered again.
  const { data: handled } = await supabase
    .from("partner_posts")
    .select("event_id, status, reason, created_at")
    .eq("partner", PARTNER)
    .gte("created_at", new Date(now.getTime() - 3 * 86400_000).toISOString());
  const handledIds = new Set(
    (handled ?? [])
      .filter(
        (row) =>
          row.event_id &&
          (row.status !== "skipped" || row.reason?.startsWith("stale") || hoursSince(row.created_at, now.getTime()) < 6),
      )
      .map((row) => row.event_id as string),
  );

  const pool = ((events ?? []) as EventRow[])
    .filter((event) => options.eventId || (!handledIds.has(event.id) && looksLikeStartupBeat(event)))
    .slice(0, GATE_BATCH);
  if (!pool.length) return base("nothing", { postedToday, candidates: 0, reason: "no startup-beat events in the window" });

  const recent = await recentTitles(48);
  const recentHeadlines = recent.map((r) => r.title);

  let verdicts: GateVerdict[];
  if (options.eventId) {
    const event = pool[0];
    verdicts = [
      {
        index: 0,
        fit: 10,
        heat: 8,
        breaking: event.urgency === "breaking" && hoursSince(event.first_seen_at, now.getTime()) <= BREAKING_MAX_HOURS,
        repeatsRecent: false,
        category: "startups",
        kicker: "STARTUPS",
        angle: "",
        reason: "requested by an administrator",
      },
    ];
  } else {
    const candidates: GateCandidate[] = pool.map((event, index) => ({
      index,
      title: event.title,
      summary: event.summary,
      outlets: event.source_keys ?? [],
      mentions: event.mention_count ?? 0,
      hoursOld: hoursSince(event.first_seen_at, now.getTime()),
      section: event.triage_section,
    }));
    try {
      verdicts = await gatePartnerCandidates(candidates, recentHeadlines);
    } catch (error) {
      return base("failed", { postedToday, candidates: pool.length, reason: `gate: ${(error as Error).message}` });
    }
  }

  // The pick: breaking first when the gap is closed, otherwise the hottest good fit,
  // the newest winning between equals: every six hours of age costs a point.
  const ranked = verdicts
    .filter((v) => pool[v.index] && v.fit >= MIN_FIT && !v.repeatsRecent)
    .map((v) => {
      const event = pool[v.index];
      const hoursOld = hoursSince(event.first_seen_at, now.getTime());
      const breaking = v.breaking && hoursOld <= BREAKING_MAX_HOURS;
      const repeat = recent.some((r) => titleOverlap(r.title, event.title) >= 0.7);
      const rank = v.heat + v.fit - hoursOld / FRESHNESS_HOURS;
      return { v, event, hoursOld, breaking, repeat, rank };
    })
    .filter((item) => !item.repeat)
    .filter((item) => gapOpen || item.breaking || options.eventId)
    .sort((a, b) => Number(b.breaking) - Number(a.breaking) || b.rank - a.rank);
  const queue = ranked.slice(0, 6).map((item) => ({
    eventId: item.event.id,
    title: item.event.title,
    fit: item.v.fit,
    heat: item.v.heat,
    hoursOld: Math.round(item.hoursOld * 10) / 10,
    breaking: item.breaking,
  }));

  // Candidates the gate turned away are remembered for a few hours, so the next pass looks further.
  if (!options.dry && !options.eventId) {
    for (const v of verdicts) {
      const event = pool[v.index];
      if (!event || v.fit >= MIN_FIT) continue;
      await record({ event_id: event.id, headline: event.title, status: "skipped", reason: `gate: fit ${v.fit}, ${v.reason}`, category: v.category, kicker: v.kicker });
    }
  }

  const pick = ranked[0];
  if (!pick) {
    return base("nothing", {
      postedToday,
      candidates: pool.length,
      gated: verdicts.length,
      reason: gapOpen ? "nothing passed the gate" : `last post ${Math.round((now.getTime() - lastAt) / 60_000)} min ago; only breaking news may follow before ${gapMinutes}`,
    });
  }
  if (options.dry) {
    return base("planned", { postedToday, candidates: pool.length, gated: verdicts.length, chosen: { eventId: pick.event.id, title: pick.event.title, verdict: pick.v }, queue });
  }

  // Sources, as the writer gathers them: the outlets on the event, most authoritative first.
  const authority = await loadAuthority();
  const { newsItems, documents } = await gatherDocuments(pick.event.id, authority, MAX_DOCUMENTS);

  // The sources' own dates decide whether this is still news: a feed without dates can make
  // a days-old story look new to the engine, and the partner's readers would see it at once.
  const dated = documents.map((doc) => doc.publishedAt).filter((d): d is string => Boolean(d));
  if (dated.length) {
    const newest = Math.max(...dated.map((d) => new Date(d).getTime()));
    const ageHours = (now.getTime() - newest) / 3600_000;
    if (ageHours > STALE_SOURCE_HOURS) {
      const reason = `stale: newest source was published ${Math.round(ageHours)} hours ago`;
      await record({ event_id: pick.event.id, headline: pick.event.title, status: "skipped", reason, category: pick.v.category, kicker: pick.v.kicker, trace: { dated } });
      return base("skipped", { postedToday, candidates: pool.length, gated: verdicts.length, reason });
    }
  }

  const sources: PartnerSource[] = documents
    .filter((doc) => doc.content.length >= MIN_DOCUMENT_CHARS)
    .map((doc) => ({ title: doc.title ?? pick.event.title, outlet: doc.source, publishedAt: doc.publishedAt ?? null, content: doc.content }));
  if (!sources.length) {
    await record({ event_id: pick.event.id, headline: pick.event.title, status: "skipped", reason: "no readable source document", category: pick.v.category, kicker: pick.v.kicker, trace: { newsItems } });
    return base("skipped", { postedToday, candidates: pool.length, gated: verdicts.length, reason: "no readable source document for the pick" });
  }

  let draft;
  try {
    draft = await draftPartnerArticle({
      topic: pick.event.title,
      angle: [pick.v.angle, pick.breaking ? "This is breaking: lead with what is confirmed, say what is not yet known." : ""].filter(Boolean).join(" "),
      sources,
      kicker: pick.breaking ? "BREAKING" : pick.v.kicker,
      category: pick.v.category,
      headlines: newsItems.map((item) => item.title),
    });
  } catch (error) {
    const reason = `draft: ${(error as Error).message}`;
    await record({ event_id: pick.event.id, headline: pick.event.title, status: "failed", reason, category: pick.v.category, kicker: pick.v.kicker });
    return base("failed", { postedToday, candidates: pool.length, gated: verdicts.length, reason });
  }

  const body = draft.bodyMarkdown.trimEnd();
  const words = wordCount(body);
  if (words < MIN_WORDS || !/[.!?"'\)\]|]$/.test(body)) {
    const reason = words < MIN_WORDS ? `draft too short (${words} words)` : "draft ended mid-sentence";
    await record({ event_id: pick.event.id, headline: draft.headline, status: "failed", reason, category: draft.category, kicker: draft.kicker, trace: { sources: sources.map((s) => ({ outlet: s.outlet, chars: s.content.length })), words } });
    return base("failed", { postedToday, candidates: pool.length, gated: verdicts.length, reason });
  }

  const categories = await fetchCategories();
  const category = categories.find((c) => c.slug === draft.category) ?? categories.find((c) => c.slug === "startups");
  const authorId = await houseAuthorId();
  if (!category || !authorId) {
    const reason = !category ? "partner has no matching section" : "partner house byline not found";
    await record({ event_id: pick.event.id, headline: draft.headline, status: "failed", reason, category: draft.category, kicker: draft.kicker });
    return base("failed", { postedToday, reason });
  }

  let slug = slugify(draft.headline) || slugify(pick.event.title) || "story";
  if (await slugTaken(slug)) slug = withUniqueSuffix(slug);

  // The cover: the picture desk chooses by their rule (a scene of the trade will do), and the
  // picture goes straight from its source into their Cloudinary, never through ours; only a
  // real photograph, never a typographic card of ours. The brief is kept so a later pass can try again.
  const picture: PictureInputs = {
    subjects: draft.entities.filter((e) => e.relation === "about").map((e) => ({ name: e.name, type: e.type })),
    related: draft.entities.filter((e) => e.relation === "mentions").map((e) => ({ name: e.name, type: e.type })),
    brief: draft.imageBrief,
    terms: draft.imageSearchTerms,
    alternatives: draft.imageAlternatives,
  };
  let coverUrl: string | null = null;
  let coverCaption: string | null = null;
  try {
    const cover = await findCover(draft.headline, draft.standfirst, picture, slug);
    if (cover) {
      coverUrl = cover.url;
      coverCaption = cover.caption;
    }
  } catch (error) {
    console.error("[partner-desk] cover failed", (error as Error).message);
  }

  // Attribution lives in the text, as their desk writes it; no list of outlets at the end.
  const content = body;
  const breaking = pick.breaking || draft.kicker === "BREAKING";
  const publishedAt = new Date().toISOString();

  try {
    const posted = await postArticle({
      slug,
      title: draft.headline,
      kicker: breaking ? "BREAKING" : draft.kicker,
      subtitle: draft.standfirst,
      summary: draft.summary,
      content,
      cover_image_url: coverUrl,
      cover_caption: coverUrl ? coverCaption : null,
      category_id: category.id,
      author_id: authorId,
      tags: draft.suggestedTags.slice(0, 6),
      is_breaking: breaking,
      published_at: publishedAt,
    });
    await record({
      event_id: pick.event.id,
      headline: draft.headline,
      status: "published",
      category: category.slug,
      kicker: breaking ? "BREAKING" : draft.kicker,
      slug: posted.slug,
      remote_id: posted.id,
      is_breaking: breaking,
      cover_url: coverUrl,
      published_at: publishedAt,
      trace: { verdict: pick.v, sources: sources.map((s) => s.outlet), words, candidates: pool.length, hoursOld: Math.round(pick.hoursOld * 10) / 10, picture, coverTries: 1 },
    });
    return base("posted", {
      postedToday: postedToday + 1,
      candidates: pool.length,
      gated: verdicts.length,
      posted: { slug: posted.slug, url: articleUrl(posted.slug), headline: draft.headline, kicker: breaking ? "BREAKING" : draft.kicker, category: category.slug, breaking },
    });
  } catch (error) {
    const reason = `post: ${(error as Error).message}`;
    await record({ event_id: pick.event.id, headline: draft.headline, status: "failed", reason, category: category.slug, kicker: draft.kicker, cover_url: coverUrl });
    return base("failed", { postedToday, reason });
  }
}
