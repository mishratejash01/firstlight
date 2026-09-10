import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { slugify, withUniqueSuffix } from "@/lib/format/slug";
import { submitToIndexNow } from "@/lib/seo/indexnow";
import { draftingModelId } from "@/lib/ai/config";
import { attachStructuredData } from "@/lib/ai/attach-structure";
import { draftFromTrend } from "@/lib/ai/draft";
import { getSourceDocuments } from "@/lib/fetch/extract";
import { illustrateArticle } from "@/lib/media/illustrate";
import { verifyEvent } from "./verify";

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
    return new URL(url).hostname.replace(/^www\./, "");
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

export async function writeEvents(limit = 1): Promise<EventWriteReport> {
  const supabase = createAdminClient();

  const autoWrite = await readSetting<boolean>("engine_auto_write", true);
  const publishing = await readSetting<boolean>("autonomous_publishing_enabled", false);
  const dailyLimit = await readSetting<number>("autonomous_daily_limit", 6);
  const delayMinutes = await readSetting<number>("autonomous_publish_delay_minutes", 0);
  const fetchSources = await readSetting<boolean>("source_fetch_enabled", true);
  const maxDocuments = await readSetting<number>("engine_max_documents", 5);
  const minSourcesRequired = await readSetting<number>("source_fetch_min_required", 1);

  const report: EventWriteReport = { autoWrite, publishing, remaining: 0, outcomes: [] };
  if (!autoWrite) return report;

  // Shared with every other automated writer, counted from the database.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("ai_assisted", true)
    .gte("ai_generated_at", since);

  report.remaining = Math.max(dailyLimit - (count ?? 0), 0);
  if (report.remaining === 0) {
    report.outcomes.push({
      eventId: "",
      title: "—",
      status: "skipped",
      reason: `Daily limit of ${dailyLimit} already reached.`,
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
      "id, title, entities, independent_sources, write_attempts, triage_section, triage_angle, triage_reason, urgency, score",
    )
    .or(
      `and(status.eq.newsworthy,or(claimed_at.is.null,claimed_at.lt.${retryBefore})),and(status.eq.writing,claimed_at.lt.${staleBefore})`,
    )
    .lt("write_attempts", MAX_ATTEMPTS)
    .order("score", { ascending: false })
    .limit(Math.min(limit, report.remaining));

  if (!candidates?.length) return report;

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true);

  const { data: authorityRows } = await supabase.from("source_authority").select("host, weight");
  const authority = new Map((authorityRows ?? []).map((r) => [r.host, Number(r.weight)]));

  const publishedSlugs: string[] = [];

  for (const event of candidates) {
    const attempts = (event.write_attempts ?? 0) + 1;

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

    // Source articles: one per outlet, the most authoritative outlets first,
    // and only the streams that link to actual articles.
    const { data: mentions } = await supabase
      .from("signal_mentions")
      .select("title, url, source_kind, source_key, observed_at")
      .eq("event_id", event.id)
      .not("url", "is", null)
      .in("source_kind", ["gnews", "rss", "hn"])
      .order("observed_at", { ascending: true })
      .limit(60);

    const byHost = new Map<string, { title: string; url: string; source: string }>();
    for (const mention of mentions ?? []) {
      if (!mention.url) continue;
      const host = hostOf(mention.url);
      if (!host || host.includes("news.google.")) continue;
      if (!byHost.has(host)) byHost.set(host, { title: mention.title, url: mention.url, source: mention.source_key });
    }

    const newsItems = [...byHost.entries()]
      .sort((a, b) => (authority.get(b[0]) ?? 0.8) - (authority.get(a[0]) ?? 0.8))
      .map(([, item]) => item);

    if (!newsItems.length) {
      await release(event.id, "No linked coverage to write from.", attempts);
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "held",
        reason: "No linked articles yet — waiting for coverage.",
      });
      continue;
    }

    let documents: {
      url: string;
      source: string;
      title: string | null;
      byline: string | null;
      content: string;
    }[] = [];

    if (fetchSources) {
      const targets = newsItems.slice(0, maxDocuments);
      const fetched = await getSourceDocuments(targets.map((item) => item.url));
      documents = fetched
        .filter((doc) => doc.status === "ok" && doc.content)
        .map((doc) => ({
          url: doc.url,
          source: targets.find((item) => item.url === doc.url)?.source ?? doc.host,
          title: doc.title,
          byline: doc.byline,
          content: doc.content as string,
        }));
    }

    if (documents.length < minSourcesRequired) {
      await release(
        event.id,
        `Only ${documents.length} of ${Math.min(newsItems.length, maxDocuments)} linked articles could be read.`,
        attempts,
      );
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "held",
        sourcesRead: documents.length,
        reason: "No readable source text — refusing to write from headlines alone.",
      });
      continue;
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

    const result = await draftFromTrend({
      term: verification.summary || event.title,
      newsItems,
      documents,
      sectionName: section?.name,
      angle: [event.triage_angle, event.urgency === "breaking" ? "This is breaking news; lead with what is confirmed." : null]
        .filter(Boolean)
        .join(" "),
    });

    if (!result.ok) {
      await release(event.id, result.error, attempts);
      report.outcomes.push({ eventId: event.id, title: event.title, status: "failed", reason: result.error });
      continue;
    }

    const draft = result.data;

    const body = draft.bodyMarkdown.trimEnd();
    if (!/[.!?"'\)\]]$/.test(body)) {
      await release(event.id, "Draft ended mid-sentence.", attempts);
      report.outcomes.push({
        eventId: event.id,
        title: event.title,
        status: "failed",
        reason: "Draft ended mid-sentence and was discarded.",
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
        ai_assisted: true,
        ai_model: draftingModelId(),
        ai_generated_at: new Date().toISOString(),
        ai_unverified_claims: draft.unverifiedClaims,
        hero_image_url: illustration?.url ?? null,
        hero_image_alt: illustration?.alt ?? null,
        hero_image_credit: illustration?.credit ?? null,
      })
      .select("id, slug")
      .single();

    if (error) {
      await release(event.id, error.message, attempts);
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

    await attachStructuredData(supabase, article.id, draft);

    if (publishing) publishedSlugs.push(article.slug);

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
