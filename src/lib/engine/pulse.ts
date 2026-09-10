import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { ingestMentions, type ClusterReport, type IncomingMention } from "./cluster";
import { scoreLiveEvents, type ScoreReport } from "./score";
import { applyOutcomes, harvestLabels } from "./learn";
import { fetchBlueskyTrending, fetchHackerNews, fetchMastodonTrending } from "./streams/social";
import { fetchWikipediaEditBursts, fetchWikipediaTopViews } from "./streams/wikipedia";
import { fetchEarthquakes, fetchPredictionMarkets } from "./streams/ground-truth";
import {
  fetchCorroborationFor,
  fetchTrendMentions,
  fetchWireMentions,
} from "./streams/search-and-news";

/**
 * One tick of the engine.
 *
 * Two cadences share this file. The fast pulse runs every minute and touches
 * only streams that are cheap and tolerant of being polled that often. The
 * slow pulse runs every fifteen minutes and touches Google, which rate-limits,
 * and Wikipedia's pageview API, which only changes daily anyway.
 *
 * Every stream is fetched independently and a failure in one costs only that
 * stream's mentions. A pulse that fails whole because Mastodon timed out
 * would be a pulse that never runs on a bad day.
 */

export type StreamResult = {
  stream: string;
  fetched: number;
  error?: string;
};

export type PulseReport = {
  cadence: "fast" | "slow";
  durationMs: number;
  streams: StreamResult[];
  cluster: ClusterReport | null;
  rollup: number;
  scoring: ScoreReport;
  corroborated?: number;
  sourceStatsUpdated?: number;
  learning?: { harvested: { outlet: number; reader: number }; applied: number };
};

type Stream = { name: string; fetch: () => Promise<IncomingMention[]> };

const FAST_STREAMS: Stream[] = [
  { name: "bluesky", fetch: fetchBlueskyTrending },
  { name: "wikipedia_edits", fetch: fetchWikipediaEditBursts },
  { name: "usgs", fetch: fetchEarthquakes },
  { name: "hn", fetch: fetchHackerNews },
  { name: "rss", fetch: fetchWireMentions },
];

const SLOW_STREAMS: Stream[] = [
  { name: "trends+gnews", fetch: fetchTrendMentions },
  { name: "wikipedia_views", fetch: fetchWikipediaTopViews },
  { name: "mastodon", fetch: fetchMastodonTrending },
  { name: "polymarket", fetch: fetchPredictionMarkets },
];

/**
 * Fetches every stream in parallel — they are different hosts — then clusters
 * the lot in one pass, so that a story arriving from three streams at once
 * founds one event rather than three, and the embedding call is made once
 * rather than once per stream.
 */
async function runStreams(
  streams: Stream[],
): Promise<{ results: StreamResult[]; cluster: ClusterReport | null }> {
  const fetched = await Promise.all(
    streams.map(async (stream) => {
      try {
        return { stream, mentions: await stream.fetch(), error: undefined };
      } catch (error) {
        return {
          stream,
          mentions: [] as IncomingMention[],
          error: error instanceof Error ? error.message : "fetch failed",
        };
      }
    }),
  );

  const results: StreamResult[] = fetched.map(({ stream, mentions, error }) => ({
    stream: stream.name,
    fetched: mentions.length,
    error,
  }));

  const mentions = fetched.flatMap((entry) => entry.mentions);
  if (!mentions.length) return { results, cluster: null };

  try {
    return { results, cluster: await ingestMentions(mentions) };
  } catch (error) {
    results.push({
      stream: "cluster",
      fetched: 0,
      error: error instanceof Error ? error.message : "cluster failed",
    });
    return { results, cluster: null };
  }
}

/**
 * Widens coverage of the strongest candidates via Google News, so the
 * corroboration and authority features have something to measure. Only the
 * top of the table: one request per event, and this runs on the slow cadence.
 */
async function corroborateTopEvents(limit: number): Promise<number> {
  const supabase = createAdminClient();
  const { data: top } = await supabase
    .from("story_events")
    .select("id, title, entities")
    .in("status", ["candidate", "newsworthy"])
    .gte("last_seen_at", new Date(Date.now() - 6 * 3600_000).toISOString())
    .order("score", { ascending: false })
    .limit(limit);

  if (!top?.length) return 0;

  const mentions = await fetchCorroborationFor(
    top.map((e) => ({ id: e.id, title: e.title, entities: e.entities ?? [] })),
  );
  if (!mentions.length) return 0;

  const report = await ingestMentions(mentions);
  return report.inserted;
}

export async function runPulse(cadence: "fast" | "slow"): Promise<PulseReport> {
  const startedAt = Date.now();
  const supabase = createAdminClient();

  const { results: streams, cluster } = await runStreams(
    cadence === "fast" ? FAST_STREAMS : SLOW_STREAMS,
  );

  let corroborated: number | undefined;
  let sourceStatsUpdated: number | undefined;
  let learning: PulseReport["learning"];

  if (cadence === "slow") {
    corroborated = await corroborateTopEvents(8);
    const { data } = await supabase.rpc("engine_update_source_stats", {
      p_since: "6 hours",
    });
    sourceStatsUpdated = data ?? 0;

    // Collect what the world and the readers have said about what we wrote,
    // then let the weights learn from it. Slow cadence: labels arrive over
    // hours, not seconds.
    const harvested = await harvestLabels();
    const learned = await applyOutcomes();
    learning = { harvested, applied: learned.outcomes };
  }

  // Roll the current hour into the entity history on every tick. Idempotent,
  // so doing it sixty times an hour is harmless and means the baseline never
  // lags by more than a minute.
  const { data: rolled } = await supabase.rpc("engine_rollup_entity_hour", {
    p_hour: new Date().toISOString(),
  });

  const scoring = await scoreLiveEvents();

  return {
    cadence,
    durationMs: Date.now() - startedAt,
    streams,
    cluster,
    rollup: rolled ?? 0,
    scoring,
    corroborated,
    sourceStatsUpdated,
    learning,
  };
}
