import "server-only";

import { SITE_NAME } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify, withUniqueSuffix } from "@/lib/format/slug";
import { submitToIndexNow } from "@/lib/seo/indexnow";
import { researchSearch } from "@/lib/seo/search-research";
import { draftingModelId } from "@/lib/ai/config";
import { attachStructuredData } from "@/lib/ai/attach-structure";
import { draftFromTrend } from "@/lib/ai/draft";
import { getSourceDocuments } from "@/lib/fetch/extract";
import { resolveGoogleNewsUrl } from "@/lib/fetch/google-redirect";
import { illustrateArticle } from "@/lib/media/illustrate";
import { verifyEvent } from "./verify";
import { cosine, embedTexts } from "./embeddings";
import { Output, generateText } from "ai";
import { z } from "zod";
import { aiIsConfigured, runWithChain } from "@/lib/ai/config";
import { recordSameAs } from "./wikidata";
import { canonicalHost } from "./hosts";
import { recordDecision, snapshotEvent } from "./decisions";

/**
 * From a newsworthy event to a published article.
 *
 * The sequence is deliberate:
 *
 *   claim   — one run takes the event, atomically, so two overlapping runs
 *             cannot write it twice
 *   read    — the source articles the event was built from, most
 *             authoritative outlets first
 *   verify  — claims extracted from those sources; the number of independent
 *             sources required scales with how serious the claims are
 *   write   — our own piece, grounded in the source text
 *   picture — a licensed photograph where one can be confirmed, otherwise a
 *             typographic card
 *   publish — as a scheduled article, live after the configured delay, so an
 *             editor has that long to pull it
 *
 * The daily cap, the delay and the kill switch are the same settings the
 * other automated writers use. Nothing here gets a separate allowance.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

/** Reclaim an event whose writer went quiet. */
const STALE_CLAIM_MINUTES = 10;
/** How long a failed attempt waits before the event is tried again. */
const RETRY_AFTER_MINUTES = 15;
const MAX_ATTEMPTS = 3;

export type EventWriteOutcome = {
  eventId: string;
  title: string;
  status: "published" | "drafted" | "held" | "failed" | "skipped";
  slug?: string;
  severity?: string;
  sourcesRead?: number;
  illustration?: "photo" | "card" | "none";
  reason?: string;
};

export type EventWriteReport = {
  autoWrite: boolean;
  publishing: boolean;
  remaining: number;
  outcomes: EventWriteOutcome[];
};

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T) ?? fallback;
}

function hostOf(url: string): string {
  try {
    return canonicalHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

/**
 * Puts an event back in the queue with a note, after a failed attempt. The
 * attempt count was incremented on claim, so an event that fails three times
 * stops being tried.
 */
async function release(eventId: string, reason: string, attempts: number): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("story_events")
    .update({
      status: attempts >= MAX_ATTEMPTS ? "rejected" : "newsworthy",
      last_error: reason,
      triage_reason:
        attempts >= MAX_ATTEMPTS ? `Gave up after ${attempts} attempts: ${reason}` : undefined,
    })
    .eq("id", eventId);
}

type NewsItem = { title: string; url: string; source: string };
type SourceDoc = {
  url: string;
  source: string;
  title: string | null;
  byline: string | null;
  content: string;
  publishedAt: string | null;
};

/**
 * The source articles behind an event: one per outlet, the most authoritative
 * outlets first, from the streams that link to actual articles. Reads up to
 * `maxDocuments` of them; zero means headlines only.
 */
async function gatherDocuments(
  eventId: string,
  authority: Map<string, number>,
  maxDocuments: number,
): Promise<{ newsItems: NewsItem[]; documents: SourceDoc[] }> {
  const supabase = createAdminClient();

  const { data: mentions } = await supabase
    .from("signal_mentions")
    .select("title, url, source_kind, source_key, observed_at")
    .eq("event_id", eventId)
    .not("url", "is", null)
    .in("source_kind", ["gnews", "rss", "hn"])
    .order("observed_at", { ascending: true })
    .limit(60);

  // One item per outlet, keyed by the outlet rather than the link's host:
  // Google News links all share one host and say nothing about who wrote it.
  const byOutlet = new Map<string, NewsItem>();
  for (const mention of mentions ?? []) {
    if (!mention.url) continue;
    const outlet = mention.source_key || hostOf(mention.url);
    if (!outlet || outlet === "unknown") continue;
    if (!byOutlet.has(outlet)) byOutlet.set(outlet, { title: mention.title, url: mention.url, source: mention.source_key });
  }

  const newsItems = [...byOutlet.entries()]
    .sort((a, b) => (authority.get(b[0]) ?? 0.8) - (authority.get(a[0]) ?? 0.8))
    .map(([, item]) => item);

  let documents: SourceDoc[] = [];
  if (maxDocuments > 0 && newsItems.length) {
    const targets = newsItems.slice(0, maxDocuments);
    // Google redirects become the real article URLs here, so the reader has
    // something it can actually open.
    for (const target of targets) target.url = await resolveGoogleNewsUrl(target.url);
    const fetched = await getSourceDocuments(targets.map((item) => item.url));
    documents = fetched
      .filter((doc) => doc.status === "ok" && doc.content)
      .map((doc) => ({
        url: doc.url,
        source: targets.find((item) => item.url === doc.url)?.source ?? doc.host,
        title: doc.title,
        byline: doc.byline,
        content: doc.content as string,
        publishedAt: doc.publishedAt,
      }));
  }

  return { newsItems, documents };
}

async function loadAuthority(): Promise<Map<string, number>> {
  const supabase = createAdminClient();
  const { data: rows } = await supabase.from("source_authority").select("host, weight");
  return new Map((rows ?? []).map((r) => [r.host, Number(r.weight)]));
}

/**
 * Everything live on the site in the last two days, embedded once per run,
 * so a candidate can be compared with all of it by meaning.
 */
type LiveStory = { slug: string; headline: string; vector: number[] };

async function loadLiveStories(): Promise<LiveStory[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("articles")
    .select("slug, headline, standfirst")
    .in("status", ["published", "scheduled"])
    .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString())
    .limit(300);
  const rows = data ?? [];
  const vectors = await embedTexts(rows.map((r) => `${r.headline}. ${r.standfirst ?? ""}`));
  return rows
    .map((r, i) => ({ slug: r.slug, headline: r.headline, vector: vectors[i] }))
    .filter((r): r is LiveStory => Array.isArray(r.vector));
}

/**
 * The published story a text duplicates, if any.
 *
 * Measured on a day's output: the same story written twice scored 0.99 and
 * 0.93 by this comparison; genuine follow-ups and neighbouring stories sat
 * between 0.84 and 0.89. The line is 0.90. A novelty feature that merely
 * lowered a score let "Hong Kong jails Tiananmen vigil organisers" run twice
 * in six hours under the same headline; this is a wall, not a weight.
 */
const DUPLICATE_SIMILARITY = 0.9;

async function duplicateOf(text: string, live: LiveStory[]): Promise<LiveStory | null> {
  if (!live.length) return null;
  const [vector] = await embedTexts([text]);
  if (!vector) return null;
  let best: { story: LiveStory; similarity: number } | null = null;
  for (const story of live) {
    const similarity = cosine(vector, story.vector);
    if (similarity >= DUPLICATE_SIMILARITY && (!best || similarity > best.similarity)) {
      best = { story, similarity };
    }
  }
  return best?.story ?? null;
}

export async function writeEvents(limit = 1): Promise<EventWriteReport> {
  const supabase = createAdminClient();

  const autoWrite = await readSetting<boolean>("engine_auto_write", true);
  const publishing = await readSetting<boolean>("autonomous_publishing_enabled", false);
  const dailyLimit = await readSetting<number>("autonomous_daily_limit", 6);
  const hourlyLimit = await readSetting<number>("autonomous_hourly_limit", 10);
  // Nothing older than this is written, however good it looks. News is a
  // perishable good; a story that could not gather its sources in this long
  // is dropped rather than published late.
  const maxAgeHours = await readSetting<number>("engine_max_story_age_hours", 8);
  const delayMinutes = await readSetting<number>("autonomous_publish_delay_minutes", 0);
  const fetchSources = await readSetting<boolean>("source_fetch_enabled", true);
  const maxDocuments = await readSetting<number>("engine_max_documents", 5);
  const minSourcesRequired = await readSetting<number>("source_fetch_min_required", 1);
  // The timing rule's three numbers, all settings: write at once above the
  // first probability; between the second and the first, wait this many
  // minutes after the second independent outlet; below the second, the
  // ordinary queue.
  const writeNowAt = await readSetting<number>("engine_timing_write_now", 0.7);
  const waitFromAt = await readSetting<number>("engine_fast_lane_threshold", 0.5);
  const waitMinutes = await readSetting<number>("engine_timing_wait_minutes", 20);

  const report: EventWriteReport = { autoWrite, publishing, remaining: 0, outcomes: [] };
  if (!autoWrite) return report;

  // Shared with every other automated writer, counted from the database.
  // The cap is on what reaches readers: drafts an editor never published do
  // not use it up, otherwise a morning of drafting would silence the desk
  // for the rest of the day once publishing is switched on.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("ai_assisted", true)
    .in("status", ["scheduled", "published"])
    .gte("ai_generated_at", since);

  // The hourly limit is the working pace; the daily one is the ceiling.
  const { count: lastHour } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("ai_assisted", true)
    .in("status", ["scheduled", "published"])
    .gte("ai_generated_at", new Date(Date.now() - 3600_000).toISOString());

  // Zero means no limit. The desk's own cadence — two stories every two
  // minutes — is then the only pace, and what passes triage and the
  // verification gate is the only count that matters.
  const dailyRoom = dailyLimit > 0 ? dailyLimit - (count ?? 0) : Number.POSITIVE_INFINITY;
  const hourlyRoom = hourlyLimit > 0 ? hourlyLimit - (lastHour ?? 0) : Number.POSITIVE_INFINITY;
  report.remaining = Math.max(Math.min(dailyRoom, hourlyRoom), 0);
  if (report.remaining === 0) {
    report.outcomes.push({
      eventId: "",
      title: "—",
      status: "skipped",
      reason:
        (lastHour ?? 0) >= hourlyLimit
          ? `Hourly limit of ${hourlyLimit} reached; resumes as the hour rolls.`
          : `Daily limit of ${dailyLimit} already reached.`,
    });
    return report;
  }

  const now = Date.now();
  const retryBefore = new Date(now - RETRY_AFTER_MINUTES * 60_000).toISOString();
  const staleBefore = new Date(now - STALE_CLAIM_MINUTES * 60_000).toISOString();

  // Newsworthy events not recently attempted, plus claims that went stale.
  const { data: candidates } = await supabase
    .from("story_events")
    .select(
      "id, title, entities, independent_sources, write_attempts, triage_section, triage_angle, triage_reason, urgency, score, first_seen_at, p_big, second_source_at",
    )
    .or(
      `and(status.eq.newsworthy,or(claimed_at.is.null,claimed_at.lt.${retryBefore})),and(status.eq.writing,claimed_at.lt.${staleBefore})`,
    )
    .lt("write_attempts", MAX_ATTEMPTS)
    .gte("first_seen_at", new Date(Date.now() - (maxAgeHours > 0 ? maxAgeHours : 24 * 365) * 3600_000).toISOString())
    .order("first_seen_at", { ascending: false })
    .limit(60);

  if (!candidates?.length) return report;
  if (!Number.isFinite(report.remaining)) report.remaining = candidates.length;

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true);

  // Balance across sections. Every candidate here has already passed triage,
  // so choosing among them by section costs nothing in quality; it only
  // decides which good story goes first. The section with the fewest stories
  // live in the last day goes first, the score breaks ties, and a section
  // with nothing worth writing simply gets nothing.
  const { data: recent } = await supabase
    .from("articles")
    .select("category_id")
    .eq("ai_assisted", true)
    .in("status", ["scheduled", "published"])
    .gte("ai_generated_at", since);
  const perSection = new Map<string, number>();
  for (const row of recent ?? []) {
    perSection.set(row.category_id, (perSection.get(row.category_id) ?? 0) + 1);
  }
  const sectionOf = (name: string | null) =>
    (categories ?? []).find((c) => c.name.toLowerCase() === (name ?? "").toLowerCase()) ??
    (categories ?? [])[0];

  // Order of the queue, age first:
  //   1. Breaking, if it broke in the last three hours.
  //   2. Then by age in two-hour steps — what came in this hour before what
  //      came in earlier, always.
  //   3. Within a step, the section with the fewest live stories today, so
  //      balance still decides among stories of the same freshness.
  //   4. Then the score, decayed by age within the step.
  const ageHours = (iso: string) => Math.max(0, (Date.now() - new Date(iso).getTime()) / 3_600_000);
  const ageStep = (iso: string) => Math.floor(ageHours(iso) / 2);
  const fresh = (e: { score: number | null; first_seen_at: string }) =>
    Number(e.score ?? 0) * Math.pow(0.5, ageHours(e.first_seen_at) / 6);
  const breaking = (e: { urgency: string | null; first_seen_at: string }) =>
    e.urgency === "breaking" && ageHours(e.first_seen_at) <= 3 ? 1 : 0;
  candidates.sort((a, b) => {
    const urgent = breaking(b) - breaking(a);
    if (urgent) return urgent;
    const step = ageStep(a.first_seen_at) - ageStep(b.first_seen_at);
    if (step) return step;
    const ca = perSection.get(sectionOf(a.triage_section)?.id ?? "") ?? 0;
    const cb = perSection.get(sectionOf(b.triage_section)?.id ?? "") ?? 0;
    return ca - cb || fresh(b) - fresh(a);
  });

  const authority = await loadAuthority();
  const live = await loadLiveStories();

  const publishedSlugs: string[] = [];

  for (const event of candidates.slice(0, Math.min(limit, report.remaining))) {
    const attempts = (event.write_attempts ?? 0) + 1;

    // The timing rule. A story the earliness model expects to grow is worth
    // a short wait for its confirmation; one it is sure of is written at
    // once; and nothing waits past three hours, or the wait would be the
    // delay it was meant to prevent.
    const pBig = Number(event.p_big ?? 0);
    const ageMinutes = (Date.now() - new Date(event.first_seen_at).getTime()) / 60_000;
    if (pBig >= waitFromAt && pBig < writeNowAt && ageMinutes < 180) {
      const secondAt = event.second_source_at ? new Date(event.second_source_at).getTime() : null;
      const waited = secondAt ? (Date.now() - secondAt) / 60_000 : null;
      if (waited === null || waited < waitMinutes) {
        await recordDecision(event.id, "timing_wait", {
          score: Number(event.score ?? 0),
          reason:
            waited === null
              ? "Waiting for a second independent outlet."
              : `Waiting ${Math.ceil(waitMinutes - waited)} more minutes after the second outlet.`,
          details: { p_big: pBig, waited_minutes: waited === null ? null : Math.round(waited) },
        });
        report.outcomes.push({
          eventId: event.id,
          title: event.title,
          status: "held",
          reason: "Timing: waiting briefly for confirmation.",
        });
        continue;
      }
    }

    // The claim. A single UPDATE whose WHERE repeats the availability test, so
    // if another run got here first this affects no rows and we move on.
    const { data: claimed } = await supabase
      .from("story_events")
      .update({
        status: "writing",
        claimed_at: new Date().toISOString(),
        write_attempts: attempts,
      })
      .eq("id", event.id)
      .or(
        `and(status.eq.newsworthy,or(claimed_at.is.null,claimed_at.lt.${retryBefore})),and(status.eq.writing,claimed_at.lt.${staleBefore})`,
      )
      .select("id");

    if (!claimed?.length) {
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "skipped",
        reason: "Claimed by another run.",
      });
      continue;
    }

    await snapshotEvent(event.id, "write");
    await recordDecision(event.id, "write_start", {
      score: Number(event.score ?? 0),
      rank: candidates.indexOf(event) + 1,
      details: { attempts, urgency: event.urgency, section: event.triage_section },
    });

    // Already on the site? The event's own words against everything live.
    const { data: topMentions } = await supabase
      .from("signal_mentions")
      .select("title")
      .eq("event_id", event.id)
      .order("observed_at", { ascending: false })
      .limit(3);
    const eventText = [event.title, ...(topMentions ?? []).map((m) => m.title)].join(". ");
    const already = await duplicateOf(eventText, live);
    if (already) {
      await supabase
        .from("story_events")
        .update({ status: "rejected", triage_reason: `Duplicate of "${already.headline}" (${already.slug}).`, last_error: null })
        .eq("id", event.id);
      await recordDecision(event.id, "duplicate", {
        score: Number(event.score ?? 0),
        reason: `Duplicate of "${already.headline}"`,
        details: { slug: already.slug, stage: "event" },
      });
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "skipped",
        reason: `Already published: ${already.headline}`,
      });
      continue;
    }

    const { newsItems, documents } = await gatherDocuments(
      event.id,
      authority,
      fetchSources ? maxDocuments : 0,
    );

    if (!newsItems.length) {
      await release(event.id, "No linked coverage to write from.", attempts);
      await recordDecision(event.id, "held", { score: Number(event.score ?? 0), reason: "No linked coverage to write from." });
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "held",
        reason: "No linked articles yet — waiting for coverage.",
      });
      continue;
    }

    if (documents.length < minSourcesRequired) {
      await release(
        event.id,
        `Only ${documents.length} of ${Math.min(newsItems.length, maxDocuments)} linked articles could be read.`,
        attempts,
      );
      await recordDecision(event.id, "held", {
        score: Number(event.score ?? 0),
        reason: `Only ${documents.length} linked articles could be read.`,
        details: { stage: "sources", readable: documents.length },
      });
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "held",
        sourcesRead: documents.length,
        reason: "No readable source text — refusing to write from headlines alone.",
      });
      continue;
    }

    // The sources' own dates decide whether this is still news. A feed
    // without dates made a three-day-old Airbnb story look new; the article
    // pages knew better. If every dated source is older than the ceiling,
    // the story is stale whatever the engine's clock says.
    const dated = documents.map((doc) => doc.publishedAt).filter((d): d is string => Boolean(d));
    if (dated.length && maxAgeHours > 0) {
      const newest = Math.max(...dated.map((d) => new Date(d).getTime()));
      const ageHours = (Date.now() - newest) / 3_600_000;
      if (ageHours > maxAgeHours) {
        await supabase
          .from("story_events")
          .update({ status: "rejected", triage_reason: `Stale: newest source was published ${Math.round(ageHours)} hours ago.`, last_error: null })
          .eq("id", event.id);
        await recordDecision(event.id, "stale", {
          score: Number(event.score ?? 0),
          reason: `Newest source was published ${Math.round(ageHours)} hours ago.`,
          details: { ageHours: Math.round(ageHours * 10) / 10 },
        });
        report.outcomes.push({
          eventId: event.id,
          title: event.title,
          status: "skipped",
          reason: `Sources are ${Math.round(ageHours)} hours old.`,
        });
        continue;
      }
    }

    // The gate. How many independent sources this needs depends on what the
    // sources are actually claiming.
    const verification = await verifyEvent({
      eventId: event.id,
      title: event.title,
      independentSources: Number(event.independent_sources ?? 0),
      documents: documents.map((doc) => ({ source: doc.source, title: doc.title, content: doc.content })),
    });

    if (!verification.passed) {
      await recordDecision(event.id, "held", {
        score: Number(event.score ?? 0),
        reason: verification.reason,
        details: {
          stage: "verification",
          severity: verification.severity,
          required: verification.requiredSources,
          independent: verification.independentSources,
        },
      });
      await release(event.id, verification.reason, attempts);
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "held",
        severity: verification.severity,
        sourcesRead: documents.length,
        reason: verification.reason,
      });
      continue;
    }

    const section =
      (categories ?? []).find(
        (c) => c.name.toLowerCase() === (event.triage_section ?? "").toLowerCase(),
      ) ?? null;

    // How readers are searching for this story right now, so the headline and
    // opening can use their words. A few seconds at most; without it the
    // story is still written.
    const research = await researchSearch({
      title: event.title,
      headlines: newsItems.map((item) => item.title),
    });

    const result = await draftFromTrend({
      term: verification.summary || event.title,
      termKind: "story",
      newsItems,
      documents,
      searchResearch: research,
      sectionName: section?.name,
      angle: [event.triage_angle, event.urgency === "breaking" ? "This is breaking news; lead with what is confirmed." : null]
        .filter(Boolean)
        .join(" "),
    });

    if (!result.ok) {
      await release(event.id, result.error, attempts);
      await recordDecision(event.id, "write_failed", { score: Number(event.score ?? 0), reason: result.error, details: { stage: "draft" } });
      report.outcomes.push({ eventId: event.id, title: event.title, status: "failed", reason: result.error });
      continue;
    }

    const draft = result.data;

    const body = draft.bodyMarkdown.trimEnd();
    if (!/[.!?"'\)\]]$/.test(body)) {
      await release(event.id, "Draft ended mid-sentence.", attempts);
      await recordDecision(event.id, "write_failed", { score: Number(event.score ?? 0), reason: "Draft ended mid-sentence.", details: { stage: "draft" } });
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "failed",
        reason: "Draft ended mid-sentence and was discarded.",
      });
      continue;
    }

    // And the draft itself, since a vague event title can hide a repeat.
    const repeat = await duplicateOf(`${draft.headline}. ${draft.standfirst}`, live);
    if (repeat) {
      await supabase
        .from("story_events")
        .update({ status: "rejected", triage_reason: `Drafted a duplicate of "${repeat.headline}" (${repeat.slug}); discarded.`, last_error: null })
        .eq("id", event.id);
      await recordDecision(event.id, "duplicate", {
        score: Number(event.score ?? 0),
        reason: `Drafted a duplicate of "${repeat.headline}"`,
        details: { slug: repeat.slug, stage: "draft" },
      });
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "skipped",
        reason: `Draft duplicated a published story: ${repeat.headline}`,
      });
      continue;
    }

    const chosenSection =
      section ??
      (categories ?? []).find(
        (c) => c.name.toLowerCase() === (draft.suggestedTags[0] ?? "").toLowerCase(),
      ) ??
      (categories ?? [])[0];

    if (!chosenSection) {
      await release(event.id, "No sections configured.", attempts);
      report.outcomes.push({ eventId: event.id, title: event.title, status: "failed", reason: "No sections configured." });
      continue;
    }

    const base = slugify(draft.headline) || slugify(event.title) || "story";
    const { data: clash } = await supabase
      .from("articles")
      .select("slug")
      .eq("slug", base)
      .maybeSingle();

    const publishedAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();

    const illustration = await illustrateArticle({
      headline: draft.headline,
      section: chosenSection.name,
      subjects: draft.entities
        .filter((entity) => entity.relation === "about")
        .map((entity) => ({ name: entity.name, type: entity.type })),
      related: draft.entities
        .filter((entity) => entity.relation !== "about")
        .map((entity) => ({ name: entity.name, type: entity.type })),
      brief: draft.imageBrief,
      terms: draft.imageSearchTerms,
    });

    const { data: article, error } = await supabase
      .from("articles")
      .insert({
        headline: draft.headline,
        slug: clash ? withUniqueSuffix(base) : base,
        standfirst: draft.standfirst,
        summary: draft.summary,
        body: draft.bodyMarkdown,
        category_id: chosenSection.id,
        origin: "original",
        status: publishing ? (delayMinutes > 0 ? "scheduled" : "published") : "draft",
        published_at: publishing ? publishedAt : null,
        // Flagged on the same rule that put it at the head of the queue:
        // triaged as breaking and first seen within three hours. The flag
        // runs it in the breaking banner, and the expire-breaking job clears
        // it once the story is past the banner's window.
        is_breaking: breaking(event) === 1,
        ai_assisted: true,
        ai_model: draftingModelId(),
        ai_generated_at: new Date().toISOString(),
        ai_unverified_claims: draft.unverifiedClaims,
        hero_image_url: illustration?.url ?? null,
        hero_image_alt: illustration?.alt ?? null,
        hero_image_credit: illustration?.credit ?? null,
        image_brief: draft.imageBrief,
        image_terms: draft.imageSearchTerms,
      })
      .select("id, slug")
      .single();

    if (error) {
      await release(event.id, error.message, attempts);
      await recordDecision(event.id, "write_failed", { score: Number(event.score ?? 0), reason: error.message, details: { stage: "insert" } });
      report.outcomes.push({ eventId: event.id, title: event.title, status: "failed", reason: error.message });
      continue;
    }

    await supabase
      .from("story_events")
      .update({
        status: "written",
        article_id: article.id,
        summary: verification.summary || null,
        last_error: null,
      })
      .eq("id", event.id);
    await recordDecision(event.id, "written", {
      score: Number(event.score ?? 0),
      details: {
        slug: article.slug,
        article_id: article.id,
        severity: verification.severity,
        sources_read: documents.length,
        minutes_since_first_seen: Math.round((Date.now() - new Date(event.first_seen_at).getTime()) / 60_000),
        // What the search research found, kept so it can later be compared
        // with the searches that actually bring readers to the story.
        search: research
          ? { searches: research.searches.map((search) => search.term), phrases: research.phrases, keywords: draft.searchKeywords }
          : null,
      },
    });

    await attachStructuredData(supabase, article.id, draft);
    if (illustration?.sameAs.length) await recordSameAs(supabase, illustration.sameAs);

    if (publishing) publishedSlugs.push(article.slug);
    const [freshVector] = await embedTexts([`${draft.headline}. ${draft.standfirst}`]);
    if (freshVector) live.push({ slug: article.slug, headline: draft.headline, vector: freshVector });

    report.outcomes.push({
      eventId: event.id,
      title: event.title,
      status: publishing ? "published" : "drafted",
      slug: article.slug,
      severity: verification.severity,
      sourcesRead: documents.length,
      illustration: illustration?.kind ?? "none",
    });
  }

  if (publishedSlugs.length && SITE_URL) {
    const { data: rows } = await supabase
      .from("articles")
      .select("slug, categories ( slug )")
      .in("slug", publishedSlugs);

    const urls = (rows ?? [])
      .map((row) => {
        const category = row.categories as unknown as { slug: string } | null;
        return category ? `${SITE_URL}/${category.slug}/${row.slug}` : null;
      })
      .filter((url): url is string => Boolean(url));

    if (urls.length) await submitToIndexNow(urls);
  }

  return report;
}

export type RedraftOutcome = {
  ok: boolean;
  slug?: string;
  sourcesRead?: number;
  reason?: string;
};

/**
 * Rewrites a written event's article from the same sources under the current
 * house rules, keeping the headline, slug and status. The previous text is
 * kept as a version by the articles trigger, so an editor can compare or
 * revert. Structure (tags, entities, key facts, FAQs) is re-attached from the
 * new draft.
 */
export async function redraftEvent(eventId: string): Promise<RedraftOutcome> {
  const supabase = createAdminClient();
  const maxDocuments = await readSetting<number>("engine_max_documents", 5);

  const { data: event } = await supabase
    .from("story_events")
    .select("id, title, summary, article_id, triage_section, triage_angle, urgency")
    .eq("id", eventId)
    .maybeSingle();
  if (!event?.article_id) return { ok: false, reason: "No article is attached to this event." };

  const { data: article } = await supabase
    .from("articles")
    .select("id, slug, headline, categories ( name )")
    .eq("id", event.article_id)
    .maybeSingle();
  if (!article) return { ok: false, reason: "The article no longer exists." };

  const { newsItems, documents } = await gatherDocuments(eventId, await loadAuthority(), maxDocuments);
  if (!documents.length) return { ok: false, reason: "None of the source articles could be read." };

  const section = article.categories as unknown as { name: string } | null;
  const research = await researchSearch({
    title: article.headline,
    headlines: newsItems.map((item) => item.title),
  });
  const result = await draftFromTrend({
    term: event.summary || event.title,
    termKind: "story",
    newsItems,
    documents,
    searchResearch: research,
    sectionName: section?.name,
    angle: [
      event.triage_angle,
      `Keep this headline exactly: "${article.headline}".`,
    ]
      .filter(Boolean)
      .join(" "),
  });
  if (!result.ok) return { ok: false, reason: result.error };

  const draft = result.data;
  const body = draft.bodyMarkdown.trimEnd();
  if (!/[.!?"'\)\]]$/.test(body)) {
    return { ok: false, reason: "Draft ended mid-sentence and was discarded." };
  }

  const { error } = await supabase
    .from("articles")
    .update({
      standfirst: draft.standfirst,
      summary: draft.summary,
      body: draft.bodyMarkdown,
      ai_unverified_claims: draft.unverifiedClaims,
      ai_generated_at: new Date().toISOString(),
    })
    .eq("id", article.id);
  if (error) return { ok: false, reason: error.message };

  // Clean re-attach: the new draft's structure replaces the old, rather than
  // piling on top of it.
  for (const table of ["article_tags", "article_entities", "article_key_facts", "article_faqs"] as const) {
    await supabase.from(table).delete().eq("article_id", article.id);
  }
  await attachStructuredData(supabase, article.id, draft);

  return { ok: true, slug: article.slug, sourcesRead: documents.length };
}

export type ReillustrateReport = { considered: number; replaced: number; titles: string[] };

/**
 * Gives a photograph to stories that went out with a card.
 *
 * Runs from the stored entities, so it costs no model call: the drafter
 * already said what each story was about. Looks at the last two weeks of
 * card-illustrated or unillustrated stories and tries the illustrator again; the tiers are
 * wider than they were when the story was written, and the card is what
 * readers see until this succeeds.
 */
const briefSchema = z.object({
  imageBrief: z
    .string()
    .describe(
      "The photograph this story needs, as a scene in three to eight words: 'hospital consultation room', 'monsoon flooding in a Delhi street'. A city, region or country may be named; never a person, a company or a party.",
    ),
  imageSearchTerms: z
    .string()
    .describe("Two or three plain words a picture library indexes for the same photograph: 'stock market', 'server rack'. No names."),
});

/** Asks the assist model what picture a story needs, when the draft did not say. */
async function briefFor(
  headline: string,
  standfirst: string | null,
): Promise<{ brief: string; terms: string } | null> {
  if (!aiIsConfigured()) return null;
  try {
    return await runWithChain("assist", async (model) => {
      const { output } = await generateText({
        model,
        maxRetries: 0,
        system: "You choose stock photographs for a news desk. Describe the scene; a place may be named, a person or a company never.",
        prompt: `Headline: ${headline}\n${standfirst ? `Standfirst: ${standfirst}` : ""}`,
        output: Output.object({ schema: briefSchema }),
      });
      return { brief: output.imageBrief, terms: output.imageSearchTerms };
    });
  } catch {
    return null;
  }
}

export async function reillustrateCards(
  limit = 3,
  scope: "cards" | "all" = "cards",
  slug?: string,
): Promise<ReillustrateReport> {
  const supabase = createAdminClient();
  const report: ReillustrateReport = { considered: 0, replaced: 0, titles: [] };

  let query = supabase
    .from("articles")
    .select("id, headline, standfirst, hero_image_url, hero_image_credit, image_brief, image_terms, categories ( name )")
    .eq("ai_assisted", true)
    .in("status", ["scheduled", "published", "draft"])
    .gte("created_at", new Date(Date.now() - 14 * 24 * 3600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(scope === "all" ? limit * 3 : limit);
  if (slug) query = query.eq("slug", slug);
  else if (scope === "cards") query = query.or(`hero_image_credit.eq.${SITE_NAME},hero_image_url.is.null`);
  const { data: articles } = await query;

  for (const article of articles ?? []) {
    if (report.considered >= limit) break;

    const { data: links } = await supabase
      .from("article_entities")
      .select("relation, entities ( name, entity_type )")
      .eq("article_id", article.id);

    const toSubject = (row: { relation: string; entities: unknown }) => {
      const entity = row.entities as { name: string; entity_type: string } | null;
      return entity ? { name: entity.name, type: entity.entity_type, relation: row.relation } : null;
    };
    const all = (links ?? []).map(toSubject).filter((s): s is NonNullable<typeof s> => Boolean(s));
    const subjects = all.filter((s) => s.relation === "about");
    const related = all.filter((s) => s.relation !== "about");

    // A picture a person chose is theirs. The engine's own uploads carry no
    // uploader; anything uploaded by a user, or pointing outside our media
    // library altogether, is left exactly as it is.
    if (article.hero_image_url) {
      const { data: asset } = await supabase
        .from("media_assets")
        .select("uploaded_by")
        .eq("secure_url", article.hero_image_url)
        .maybeSingle();
      if (!asset || asset.uploaded_by) continue;
    }

    const isCard = article.hero_image_credit === SITE_NAME || !article.hero_image_credit;
    report.considered += 1;

    let brief = article.image_brief;
    let terms = article.image_terms;
    if (!brief || !terms) {
      const asked = await briefFor(article.headline, article.standfirst);
      if (asked) {
        brief = brief ?? asked.brief;
        terms = terms ?? asked.terms;
        await supabase.from("articles").update({ image_brief: brief, image_terms: terms }).eq("id", article.id);
      }
    }
    if (!subjects.length && !related.length && !brief) continue;

    // A story that already has a picture is only redone when a relevant one
    // exists — the subject itself or the writer's scene. A card or an empty
    // slot takes anything the full cascade can find.
    const section = (article.categories as unknown as { name: string } | null)?.name ?? "News";
    const illustration = await illustrateArticle({
      headline: article.headline,
      section,
      subjects,
      related,
      brief,
      terms,
      relevantOnly: !isCard,
    });
    if (!illustration) continue;
    // A card is only worth applying to a story that has nothing at all; a
    // story that already has a card keeps waiting for a photograph.
    if (illustration.kind !== "photo" && article.hero_image_url) continue;

    const { error } = await supabase
      .from("articles")
      .update({
        hero_image_url: illustration.url,
        hero_image_alt: illustration.alt,
        hero_image_credit: illustration.credit,
      })
      .eq("id", article.id);
    if (error) continue;

    if (illustration.sameAs.length) await recordSameAs(supabase, illustration.sameAs);
    report.replaced += 1;
    report.titles.push(article.headline);
  }

  return report;
}
