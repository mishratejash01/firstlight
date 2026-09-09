import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { slugify, withUniqueSuffix } from "@/lib/format/slug";
import { submitToIndexNow } from "@/lib/seo/indexnow";
import { draftingModelId } from "@/lib/ai/config";
import { draftFromTrend } from "@/lib/ai/draft";
import { getSourceDocuments } from "@/lib/fetch/extract";
import type { TrendNewsItem } from "./google-trends";

/**
 * Turns triaged trends into articles.
 *
 * Shares the daily cap, the publish delay and the kill switch with the topic
 * scheduler, deliberately: two independent pipelines each publishing up to
 * their own limit is how a site quietly doubles its output without anyone
 * choosing that.
 *
 * Whether these publish or land as drafts depends on the same
 * `autonomous_publishing_enabled` setting as everything else.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export type WriteUpOutcome = {
  term: string;
  status: "published" | "drafted" | "failed" | "skipped";
  slug?: string;
  unverifiedClaimCount?: number;
  /** How many linked articles were actually readable. Zero means headlines only. */
  sourcesRead?: number;
  reason?: string;
};

export type WriteUpReport = {
  autoWrite: boolean;
  publishing: boolean;
  outcomes: WriteUpOutcome[];
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

export async function writeUpTrends(limit = 3): Promise<WriteUpReport> {
  const supabase = createAdminClient();

  const autoWrite = await readSetting<boolean>("trending_auto_write", false);
  const publishing = await readSetting<boolean>("autonomous_publishing_enabled", false);
  const dailyLimit = await readSetting<number>("autonomous_daily_limit", 6);
  const delayMinutes = await readSetting<number>("autonomous_publish_delay_minutes", 0);
  const fetchSources = await readSetting<boolean>("source_fetch_enabled", true);
  const maxPerTrend = await readSetting<number>("source_fetch_max_per_trend", 3);

  const report: WriteUpReport = { autoWrite, publishing, outcomes: [] };
  if (!autoWrite) return report;

  // Shared with the topic scheduler, counted from the database.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("ai_assisted", true)
    .gte("ai_generated_at", since);

  const remaining = Math.max(dailyLimit - (count ?? 0), 0);
  if (remaining === 0) {
    report.outcomes.push({
      term: "—",
      status: "skipped",
      reason: `Daily limit of ${dailyLimit} already reached.`,
    });
    return report;
  }

  const { data: trends } = await supabase
    .from("trending_topics")
    .select("id, term, news_items, triage_category, triage_reason")
    .eq("status", "newsworthy")
    .order("traffic_rank", { ascending: false, nullsFirst: false })
    .limit(Math.min(limit, remaining));

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true);

  const publishedSlugs: string[] = [];

  for (const trend of trends ?? []) {
    const newsItems = (trend.news_items as unknown as TrendNewsItem[]) ?? [];

    // A trend with no matched coverage gives the model nothing to work from,
    // which is exactly the situation that produces invention.
    if (!newsItems.length) {
      await supabase
        .from("trending_topics")
        .update({ status: "rejected", triage_reason: "No coverage available to write from." })
        .eq("id", trend.id);

      report.outcomes.push({
        term: trend.term,
        status: "skipped",
        reason: "No coverage to ground the piece in.",
      });
      continue;
    }

    // Read the linked articles before writing. Without this the model has two
    // sentences of headline to work from, which produces a piece noting that
    // other outlets are covering something — technically true and not worth
    // publishing.
    let documents: {
      url: string;
      source: string;
      title: string | null;
      byline: string | null;
      content: string;
    }[] = [];

    if (fetchSources) {
      const targets = newsItems.slice(0, maxPerTrend);
      const fetched = await getSourceDocuments(targets.map((item) => item.url));

      documents = fetched
        .filter((doc) => doc.status === "ok" && doc.content)
        .map((doc) => {
          const matching = targets.find((item) => item.url === doc.url);
          return {
            url: doc.url,
            source: matching?.source ?? doc.host,
            title: doc.title,
            byline: doc.byline,
            content: doc.content as string,
          };
        });
    }

    const result = await draftFromTrend({
      term: trend.term,
      newsItems,
      documents,
      sectionName: undefined,
      angle: trend.triage_reason ?? undefined,
    });

    if (!result.ok) {
      report.outcomes.push({ term: trend.term, status: "failed", reason: result.error });
      continue;
    }

    const draft = result.data;

    // Match the section triage suggested, falling back to the first active one
    // rather than failing over a label mismatch.
    const section =
      (categories ?? []).find(
        (c) => c.name.toLowerCase() === (draft.suggestedTags[0] ?? "").toLowerCase(),
      ) ?? (categories ?? [])[0];

    if (!section) {
      report.outcomes.push({ term: trend.term, status: "failed", reason: "No sections configured." });
      continue;
    }

    const base = slugify(draft.headline) || slugify(trend.term) || "trending";
    const { data: clash } = await supabase
      .from("articles")
      .select("slug")
      .eq("slug", base)
      .maybeSingle();

    const publishedAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();

    const { data: article, error } = await supabase
      .from("articles")
      .insert({
        headline: draft.headline,
        slug: clash ? withUniqueSuffix(base) : base,
        standfirst: draft.standfirst,
        summary: draft.summary,
        body: draft.bodyMarkdown,
        category_id: section.id,
        origin: "original",
        status: publishing ? (delayMinutes > 0 ? "scheduled" : "published") : "draft",
        published_at: publishing ? publishedAt : null,
        ai_assisted: true,
        ai_model: draftingModelId(),
        ai_generated_at: new Date().toISOString(),
        ai_unverified_claims: draft.unverifiedClaims,
      })
      .select("id, slug")
      .single();

    if (error) {
      report.outcomes.push({ term: trend.term, status: "failed", reason: error.message });
      continue;
    }

    await supabase
      .from("trending_topics")
      .update({ status: "written", article_id: article.id })
      .eq("id", trend.id);

    if (publishing) publishedSlugs.push(article.slug);

    report.outcomes.push({
      term: trend.term,
      status: publishing ? "published" : "drafted",
      slug: article.slug,
      unverifiedClaimCount: draft.unverifiedClaims.length,
      sourcesRead: documents.length,
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
