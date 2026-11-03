import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { slugify, withUniqueSuffix } from "@/lib/format/slug";
import { illustrateArticle } from "@/lib/media/illustrate";
import {
  draftPartnerArticle,
  gatePartnerCandidates,
  type GateCandidate,
  type GateVerdict,
  type PartnerSource,
} from "@/lib/ai/partner-draft";
import {
  articleUrl,
  fetchCategories,
  houseAuthorId,
  karostartupConfigured,
  PARTNER,
  postArticle,
  recentTitles,
  slugTaken,
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
/** Events seen more recently than this are candidates. */
const CANDIDATE_WINDOW_HOURS = 18;
/** Candidates the gate reads in one call. */
const GATE_BATCH = 12;
/** Source documents fetched for the chosen story. */
const MAX_DOCUMENTS = 4;
const MIN_DOCUMENT_CHARS = 500;
const MIN_WORDS = 450;
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
  posted?: { slug: string; url: string; headline: string; kicker: string; category: string; breaking: boolean };
  durationMs: number;
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

export async function runPartnerDesk(options: { dry?: boolean; eventId?: string } = {}): Promise<PartnerDeskReport> {
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
  const gapOpen = now.getTime() - lastAt >= gapMinutes * 60_000;
  const deskOpen = clock.minutes >= OPEN_FROM_MINUTES && clock.minutes <= OPEN_UNTIL_MINUTES;

  if (!options.eventId) {
    if (postedToday >= cap) return base("skipped", { postedToday, reason: `today's ${cap} are posted` });
    if (!deskOpen) return base("skipped", { postedToday, reason: "outside the desk's hours" });
  }

  // Candidates: what the engine has seen move lately, minus what this desk has handled.
  const since = new Date(now.getTime() - CANDIDATE_WINDOW_HOURS * 3600_000).toISOString();
  let query = supabase
    .from("story_events")
    .select("id, title, summary, entities, source_keys, mention_count, score, first_seen_at, last_seen_at, status, triage_section, urgency")
    .gte("last_seen_at", since)
    .in("status", ["candidate", "newsworthy", "writing", "written"])
    .order("score", { ascending: false })
    .limit(80);
  if (options.eventId) query = supabase.from("story_events").select("id, title, summary, entities, source_keys, mention_count, score, first_seen_at, last_seen_at, status, triage_section, urgency").eq("id", options.eventId);
  const { data: events, error: eventsError } = await query;
  if (eventsError) return base("failed", { postedToday, reason: eventsError.message });

  const { data: handled } = await supabase
    .from("partner_posts")
    .select("event_id, status, created_at")
    .eq("partner", PARTNER)
    .gte("created_at", new Date(now.getTime() - 3 * 86400_000).toISOString());
  const handledIds = new Set(
    (handled ?? [])
      .filter((row) => row.event_id && (row.status !== "skipped" || hoursSince(row.created_at, now.getTime()) < 6))
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

  // The pick: breaking first when the gap is closed, otherwise the hottest good fit.
  const ranked = verdicts
    .filter((v) => pool[v.index] && v.fit >= MIN_FIT && !v.repeatsRecent)
    .map((v) => {
      const event = pool[v.index];
      const breaking = v.breaking && hoursSince(event.first_seen_at, now.getTime()) <= BREAKING_MAX_HOURS;
      const repeat = recent.some((r) => titleOverlap(r.title, event.title) >= 0.7);
      return { v, event, breaking, repeat };
    })
    .filter((item) => !item.repeat)
    .filter((item) => gapOpen || item.breaking || options.eventId)
    .sort((a, b) => Number(b.breaking) - Number(a.breaking) || b.v.heat + b.v.fit - (a.v.heat + a.v.fit));

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
    return base("planned", { postedToday, candidates: pool.length, gated: verdicts.length, chosen: { eventId: pick.event.id, title: pick.event.title, verdict: pick.v } });
  }

  // Sources, as the writer gathers them: the outlets on the event, most authoritative first.
  const authority = await loadAuthority();
  const { newsItems, documents } = await gatherDocuments(pick.event.id, authority, MAX_DOCUMENTS);
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
    await record({ event_id: pick.event.id, headline: draft.headline, status: "failed", reason, category: draft.category, kicker: draft.kicker });
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

  // The cover: the picture desk chooses as it does for our own stories; only a real
  // photograph travels to the partner's Cloudinary, never a typographic card of ours.
  let coverUrl: string | null = null;
  let coverCaption: string | null = null;
  try {
    const illustration = await illustrateArticle({
      headline: draft.headline,
      standfirst: draft.standfirst,
      section: "startups",
      subjects: draft.entities.filter((e) => e.relation === "about").map((e) => ({ name: e.name, type: e.type })),
      related: draft.entities.filter((e) => e.relation === "mentions").map((e) => ({ name: e.name, type: e.type })),
      brief: draft.imageBrief,
      terms: draft.imageSearchTerms,
      alternatives: draft.imageAlternatives,
      relevantOnly: true,
    });
    if (illustration?.kind === "photo") {
      coverUrl = await uploadCover(illustration.url, slug);
      coverCaption = illustration.credit ? `${illustration.alt} (${illustration.credit})` : illustration.alt;
    }
  } catch (error) {
    console.error("[partner-desk] cover failed", (error as Error).message);
  }

  const attribution = newsItems
    .slice(0, 6)
    .map((item) => `- [${item.title}](${item.url}) — ${item.source}`)
    .join("\n");
  const content = attribution ? `${body}\n\n## Sources\n\n${attribution}` : body;
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
      trace: { verdict: pick.v, sources: sources.map((s) => s.outlet), words, candidates: pool.length },
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
