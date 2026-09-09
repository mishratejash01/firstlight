import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTrends, type TrendingTerm } from "./google-trends";
import { gatherSignals } from "./signals";

/**
 * Polls Google Trends and stages what it finds.
 *
 * Two filters run here, both deterministic and both cheap:
 *
 *   1. The exclusion list — horoscopes, betting, lottery draws. These trend
 *      constantly and none of them is reporting. Filtering them in SQL-adjacent
 *      code rather than asking a model keeps the decision auditable and free.
 *   2. A search-volume floor, which removes the long tail of local noise.
 *
 * What survives is left `pending`. Whether it is actually newsworthy is a
 * judgement, and that is triage's job — done by a model where one is
 * configured, and by an editor where one is not. Nothing is written from a
 * trend that has not been through it.
 */

export type TrendIngestReport = {
  region: string;
  fetched: number;
  inserted: number;
  refreshed: number;
  excluded: number;
  belowThreshold: number;
  enriched: number;
  error?: string;
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

/**
 * Substring match, lowercased.
 *
 * Deliberately not a word-boundary regex: the exclusion list carries Devanagari
 * terms as well as Latin ones, and word boundaries do not behave the same way
 * across scripts. A blunt substring test is the one that works for both.
 */
function isExcluded(term: string, patterns: string[]): string | null {
  const haystack = term.toLowerCase();
  for (const pattern of patterns) {
    if (haystack.includes(pattern.toLowerCase())) return pattern;
  }
  return null;
}

async function ingestRegion(
  region: string,
  patterns: string[],
  minTraffic: number,
): Promise<TrendIngestReport> {
  const supabase = createAdminClient();
  const report: TrendIngestReport = {
    region,
    fetched: 0,
    inserted: 0,
    refreshed: 0,
    excluded: 0,
    belowThreshold: 0,
    enriched: 0,
  };

  let terms: TrendingTerm[];
  try {
    terms = await fetchTrends(region);
  } catch (error) {
    report.error = error instanceof Error ? error.message : "Trends fetch failed";
    return report;
  }

  report.fetched = terms.length;

  for (const trend of terms) {
    const excludedBy = isExcluded(trend.term, patterns);
    if (excludedBy) {
      report.excluded += 1;
      // Recorded as rejected rather than dropped, so the exclusion list can be
      // reviewed against what it actually caught.
      await supabase.from("trending_topics").upsert(
        {
          term: trend.term,
          region,
          approx_traffic: trend.approxTraffic,
          traffic_rank: trend.trafficRank,
          news_items: trend.newsItems as never,
          status: "rejected",
          triage_reason: `Matched the exclusion "${excludedBy}".`,
          triage_category: "excluded",
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "term,region" },
      );
      continue;
    }

    if ((trend.trafficRank ?? 0) < minTraffic) {
      report.belowThreshold += 1;
      continue;
    }

    const { data: existing } = await supabase
      .from("trending_topics")
      .select("id, status, traffic_rank")
      .eq("term", trend.term)
      .eq("region", region)
      .maybeSingle();

    if (existing) {
      // Velocity is the whole reason previous_traffic_rank is kept: a term
      // climbing is a story breaking, and one falling has already been covered
      // everywhere. It can only be measured against the last time we looked.
      const previous = existing.traffic_rank ?? null;
      const velocity =
        previous && previous > 0 && trend.trafficRank
          ? Number((trend.trafficRank / previous).toFixed(3))
          : null;

      // Refresh the volume and coverage, but never reopen a decision an editor
      // or triage has already made.
      await supabase
        .from("trending_topics")
        .update({
          approx_traffic: trend.approxTraffic,
          previous_traffic_rank: previous,
          traffic_rank: trend.trafficRank,
          velocity,
          news_items: trend.newsItems as never,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      report.refreshed += 1;
      continue;
    }

    // Only new candidates are enriched. Signals cost a Google News request
    // each, and re-measuring corroboration for a term we have already judged
    // buys nothing.
    const signals = await gatherSignals(trend.term, region, trend.newsItems);
    report.enriched += 1;

    await supabase.from("trending_topics").insert({
      term: trend.term,
      region,
      approx_traffic: trend.approxTraffic,
      traffic_rank: trend.trafficRank,
      // Trends supplies three links; Google News usually finds more, and the
      // writer reads whichever it can.
      news_items: [...trend.newsItems, ...signals.extraNewsItems] as never,
      corroboration: signals.corroboration,
      authority_score: signals.authorityScore,
      demand_score: signals.demandScore,
      cluster_key: signals.clusterKey,
      status: "pending",
    });
    report.inserted += 1;
  }

  return report;
}

export async function ingestTrends(): Promise<TrendIngestReport[]> {
  const supabase = createAdminClient();

  const regions = await readSetting<string[]>("trending_regions", ["IN"]);
  const minTraffic = await readSetting<number>("trending_min_traffic", 1000);

  const { data: exclusions } = await supabase
    .from("trend_exclusions")
    .select("pattern");
  const patterns = (exclusions ?? []).map((row) => row.pattern);

  const reports: TrendIngestReport[] = [];
  for (const region of regions) {
    reports.push(await ingestRegion(region, patterns, minTraffic));
  }

  // Scores are recomputed for everything still in play, not just what arrived
  // in this run: saturation and freshness change with time, so a candidate that
  // scored well an hour ago may no longer.
  await supabase.rpc("rescore_trends");

  return reports;
}
