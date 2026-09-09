import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { searchGoogleNews, type NewsHit } from "./google-news";
import type { TrendNewsItem } from "./google-trends";

/**
 * Enriches a candidate story with the signals that decide whether it leads.
 *
 * Google Trends alone answers "what are people typing?" These signals answer
 * the questions that actually matter to a news desk: is it growing, is anyone
 * reputable reporting it, and did our own readers already come looking for it
 * and leave empty-handed.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "at", "by", "from", "as", "is", "are", "was", "were", "be", "been", "it",
  "its", "this", "that", "these", "those", "vs", "v", "live", "today", "new",
  "news", "latest", "update", "updates", "how", "what", "why", "when", "who",
]);

/**
 * A rough fingerprint of what a story is about.
 *
 * Two trends citing "Gold falls for third day" and "Why gold is falling" are
 * the same story, and publishing both is how an automated site starts looking
 * automated. Taking the longest distinctive words and sorting them catches that
 * without pretending to understand the sentence.
 */
export function clusterKey(term: string, headline: string | null): string {
  const words = `${term} ${headline ?? ""}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));

  const distinctive = [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
    .sort();

  return distinctive.join("-") || term.toLowerCase().slice(0, 40);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type TrendSignals = {
  corroboration: number;
  authorityScore: number;
  demandScore: number;
  clusterKey: string;
  extraNewsItems: TrendNewsItem[];
};

/**
 * How many distinct outlets are on it, and how good are they.
 *
 * Counting distinct hosts rather than articles matters: one outlet publishing
 * five updates on a story is not five outlets, and treating it as such would
 * reward whoever posts most rather than what is actually happening.
 */
async function measureCoverage(
  hits: { source: string; url: string }[],
): Promise<{ corroboration: number; authorityScore: number }> {
  const supabase = createAdminClient();

  const hosts = [...new Set(hits.map((hit) => hostOf(hit.url)).filter(Boolean))] as string[];
  if (!hosts.length) return { corroboration: 0, authorityScore: 0 };

  const { data: known } = await supabase
    .from("source_authority")
    .select("host, weight")
    .in("host", hosts);

  const weights = new Map((known ?? []).map((row) => [row.host, Number(row.weight)]));

  // An outlet we have never rated is treated as ordinary rather than worthless.
  // Being unknown to our list is not evidence of being bad.
  const total = hosts.reduce((sum, host) => sum + (weights.get(host) ?? 1.0), 0);

  return {
    corroboration: hosts.length,
    // Averaged, so five aggregators do not out-score two wire services.
    authorityScore: Number((total / hosts.length).toFixed(2)),
  };
}

/**
 * Did our own readers look for this and find nothing?
 *
 * The strongest signal on the list, because it is demand we have already failed
 * to meet — a reader who searched the site and left empty-handed is a story we
 * should have had.
 */
async function measureDemand(term: string): Promise<number> {
  const supabase = createAdminClient();

  const words = term
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));

  if (!words.length) return 0;

  const { data: searches } = await supabase
    .from("analytics_events")
    .select("search_query, properties")
    .eq("event_type", "internal_search")
    .gte("occurred_at", new Date(Date.now() - 7 * 24 * 3600_000).toISOString())
    .limit(500);

  let score = 0;
  for (const row of searches ?? []) {
    const query = (row.search_query ?? "").toLowerCase();
    if (!query) continue;
    if (!words.some((word) => query.includes(word))) continue;

    const results = Number(
      (row.properties as Record<string, unknown> | null)?.result_count ?? 1,
    );
    // A search that found nothing is worth several that found something.
    score += results === 0 ? 3 : 1;
  }

  return Math.min(score, 8);
}

export async function gatherSignals(
  term: string,
  region: string,
  existingItems: TrendNewsItem[],
): Promise<TrendSignals> {
  // Ask Google News who is covering it. Trends tells us people are searching;
  // this tells us whether it is actually being reported.
  let hits: NewsHit[] = [];
  try {
    hits = await searchGoogleNews(term, region);
  } catch {
    hits = [];
  }

  const combined = [
    ...existingItems.map((item) => ({ source: item.source, url: item.url })),
    ...hits.map((hit) => ({ source: hit.source, url: hit.url })),
  ];

  const { corroboration, authorityScore } = await measureCoverage(combined);
  const demandScore = await measureDemand(term);

  const topHeadline = existingItems[0]?.title ?? hits[0]?.title ?? null;

  // Fold in the best of what Google News found, so the writer has more than the
  // three links Trends supplies. Ordered by outlet weight is unnecessary here —
  // the fetcher reads them in order and stops at the configured limit.
  const extraNewsItems: TrendNewsItem[] = hits
    .filter((hit) => !existingItems.some((item) => item.url === hit.url))
    .slice(0, 5)
    .map((hit) => ({
      title: hit.title,
      source: hit.source,
      url: hit.url,
      picture: null,
    }));

  return {
    corroboration,
    authorityScore,
    demandScore,
    clusterKey: clusterKey(term, topHeadline),
    extraNewsItems,
  };
}
