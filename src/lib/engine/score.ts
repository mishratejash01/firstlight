import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Event scoring.
 *
 * Nine features, each a number in roughly 0..10, combined by weights the
 * engine learns. The features are the interesting part; the combination is
 * deliberately a linear model, because a linear model can be read — an editor
 * can see exactly why a story ranked where it did, and the learner can
 * attribute an outcome to the features that produced it.
 *
 *   burst          Kleinberg-style: is this entity's mention rate abnormal?
 *   surprise       Bayesian surprise (Itti & Baldi): KL divergence between
 *                  what we expected of this entity and what we now believe
 *   corroboration  how many *independent* sources — syndication discounted
 *   lead_authority the strongest outlet carrying it, and how many serious ones
 *   acceleration   is it still growing, or already spent
 *   magnitude      how big, on each source's own scale
 *   relevance      home-market share and reader demand
 *   novelty        distance from what we have already published
 *   freshness      time decay
 *   momentum       the earliness model's probability that this becomes a
 *                  big story, from its first half hour, scaled to 0..10
 */

export type Features = {
  burst: number;
  surprise: number;
  corroboration: number;
  lead_authority: number;
  acceleration: number;
  magnitude: number;
  relevance: number;
  novelty: number;
  freshness: number;
  momentum: number;
};

export const FEATURE_NAMES: (keyof Features)[] = [
  "burst",
  "surprise",
  "corroboration",
  "lead_authority",
  "acceleration",
  "magnitude",
  "relevance",
  "novelty",
  "freshness",
  "momentum",
];

// ---------------------------------------------------------------------------
// Special functions. Lanczos for log-gamma, recurrence plus asymptotic series
// for digamma. Both accurate to well beyond what a ranking needs.
// ---------------------------------------------------------------------------

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
  12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7,
];

export function lgamma(x: number): number {
  if (x < 0.5) {
    // Reflection.
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  }
  x -= 1;
  let a = 0.9999999999998099;
  const t = x + 7.5;
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export function digamma(x: number): number {
  let result = 0;
  // Shift up until the asymptotic series is accurate.
  while (x < 6) {
    result -= 1 / x;
    x += 1;
  }
  const inv = 1 / x;
  const inv2 = inv * inv;
  result +=
    Math.log(x) -
    0.5 * inv -
    inv2 * (1 / 12 - inv2 * (1 / 120 - inv2 * (1 / 252 - inv2 * (1 / 240 - inv2 / 132))));
  return result;
}

/**
 * KL(Gamma(a1, b1) || Gamma(a0, b0)), rate parameterisation.
 *
 * The posterior over an entity's rate after seeing k mentions in T hours,
 * measured against the prior from its history. Large when what happened was
 * not what the history led us to expect — which is, precisely, news.
 */
export function gammaKl(a1: number, b1: number, a0: number, b0: number): number {
  return (
    (a1 - a0) * digamma(a1) -
    lgamma(a1) +
    lgamma(a0) +
    a0 * (Math.log(b1) - Math.log(b0)) +
    (a1 * (b0 - b1)) / b1
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

type Aggregate = {
  event_id: string;
  title: string;
  entities: string[];
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  region_mix: Record<string, number>;
  mentions_total: number;
  mentions_1h: number;
  mentions_24h: number;
  bucket_0_30: number;
  bucket_30_60: number;
  bucket_60_90: number;
  sources: { key: string; kind: string; first_at: string }[];
  magnitudes: { kind: string; magnitude: number }[];
  p_big: number | null;
};

type Baseline = { entity: string; source_kind: string; hourly_mean: number; hourly_var: number };

type SourceInfo = {
  authority: Map<string, number>;
  lead: Map<string, number>;
  pairs: Map<string, number>;
};

/** Each stream's own idea of "a lot", used to put magnitudes on one scale. */
const MAGNITUDE_SCALE: Record<string, number> = {
  trends: 20_000,
  wikipedia_views: 500_000,
  wikipedia_edits: 30,
  hn: 800,
  usgs: 1_500,
  polymarket: 40,
  // A trending *position*, not a count. Rank 1 should register, not dominate.
  bluesky: 60,
  mastodon: 2_000,
  reddit: 20_000,
  youtube: 5_000_000,
};

const HOME_REGION = "IN";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

/**
 * Burst: Poisson log-likelihood ratio of a burst state against the baseline.
 *
 * With baseline rate λ and observed k in one hour, compares the hypothesis
 * "rate is 4λ" against "rate is λ". Positive means the burst explains the data
 * better. Taken as the max over the event's entities, since one entity
 * bursting is enough to make it a story.
 */
function burstFeature(agg: Aggregate, baselines: Baseline[]): number {
  const S = 4;
  let best = 0;

  for (const entity of agg.entities) {
    const rows = baselines.filter((b) => b.entity === entity);
    const lambda = Math.max(
      rows.reduce((sum, b) => sum + Number(b.hourly_mean), 0),
      0.05,
    );
    const k = agg.mentions_1h;
    const llr = k * Math.log(S) - lambda * (S - 1);
    best = Math.max(best, llr);
  }

  // An entity nobody has ever mentioned has no baseline; treat its first hour
  // on the same footing as a small burst rather than an infinite one.
  if (!agg.entities.length) return clamp(Math.log1p(agg.mentions_1h) * 2, 0, 10);
  return clamp(best, 0, 10);
}

/** Bayesian surprise, max over entities, squashed into range. */
function surpriseFeature(agg: Aggregate, baselines: Baseline[]): number {
  let best = 0;
  const T = 24;
  const k = agg.mentions_24h;

  for (const entity of agg.entities) {
    const rows = baselines.filter((b) => b.entity === entity);
    const mean = Math.max(rows.reduce((s, b) => s + Number(b.hourly_mean), 0), 0.05);
    const variance = Math.max(rows.reduce((s, b) => s + Number(b.hourly_var), 0), mean);

    // One-sided. KL divergence is also large when an entity gets far *less*
    // coverage than usual, and a quiet day is not a story.
    if (k <= mean * T) continue;

    // Method-of-moments Gamma prior on the hourly rate.
    const a0 = (mean * mean) / variance;
    const b0 = mean / variance;
    const a1 = a0 + k;
    const b1 = b0 + T;

    const kl = gammaKl(a1, b1, a0, b0);
    if (Number.isFinite(kl)) best = Math.max(best, kl);
  }

  return clamp(Math.log1p(best) * 2.2, 0, 10);
}

/**
 * Effective independent sources.
 *
 * Sources are walked in authority order. Each new one is counted at
 * (1 − its highest co-coverage with anything already counted): a source that
 * always carries the same stories as one we have already counted adds almost
 * nothing, however many times it runs the copy. Five syndicated copies of a
 * wire story come out at roughly 1.2 sources, not 5.
 */
function independentSources(agg: Aggregate, info: SourceInfo): number {
  const keys = [...new Set(agg.sources.map((s) => s.key))].sort(
    (a, b) => (info.authority.get(b) ?? 1) - (info.authority.get(a) ?? 1),
  );

  const counted: string[] = [];
  let effective = 0;

  for (const key of keys) {
    let maxCorrelation = 0;
    for (const prior of counted) {
      const c = Math.max(
        info.pairs.get(`${key}|${prior}`) ?? 0,
        info.pairs.get(`${prior}|${key}`) ?? 0,
      );
      maxCorrelation = Math.max(maxCorrelation, c);
    }
    effective += 1 - maxCorrelation;
    counted.push(key);
  }

  return effective;
}

function corroborationFeature(effective: number): number {
  // One source is not corroboration; it is a report. The scale starts at the
  // second independent source and is log-shaped after that, because the
  // second matters far more than the ninth.
  return clamp(Math.log1p(Math.max(effective - 1, 0)) * 5, 0, 10);
}

/**
 * Authority: is a serious outlet carrying this, and how many.
 *
 * Measured, not assumed. On 639 labelled events the single best predictor
 * of whether something was on an independent front page was the strongest
 * outlet on the event (AUC 0.87), followed by the number of authoritative
 * outlets (0.83). The previous version averaged authority across every
 * source and weighted it by a lead-time estimate, which diluted a BBC story
 * with five blogs to nothing and scored 0.49 — a coin toss. The lead
 * estimate stays in source_stats for later; it has no history to draw on yet.
 */
function authorityFeature(agg: Aggregate, info: SourceInfo): number {
  const keys = [...new Set(agg.sources.map((s) => s.key))].filter(
    (key) => key !== "news.google.com",
  );
  if (!keys.length) return 0;

  const weights = keys.map((key) => info.authority.get(key) ?? 0.8);
  const strongest = Math.max(...weights);
  const authoritative = weights.filter((w) => w >= 1.5).length;

  return clamp(strongest * 2.5 + Math.min(authoritative, 4) * 1.5, 0, 10);
}

/**
 * Acceleration from three half-hour buckets: velocity is the change in rate,
 * acceleration the change in that. A story still gathering coverage outranks
 * one at the same volume that has already peaked.
 */
function accelerationFeature(agg: Aggregate): number {
  const r0 = agg.bucket_0_30;
  const r1 = agg.bucket_30_60;
  const r2 = agg.bucket_60_90;
  const velocity = r0 - r1;
  const acceleration = velocity - (r1 - r2);

  let score = Math.log1p(Math.max(velocity, 0)) * 2.5;
  score += Math.sign(acceleration) * Math.log1p(Math.abs(acceleration));
  return clamp(score, 0, 10);
}

/** The largest normalised magnitude any source reported. */
function magnitudeFeature(agg: Aggregate): number {
  let best = 0;
  for (const item of agg.magnitudes) {
    const scale = MAGNITUDE_SCALE[item.kind];
    if (!scale || item.magnitude == null) continue;
    best = Math.max(best, Number(item.magnitude) / scale);
  }
  return clamp(Math.sqrt(best) * 10, 0, 10);
}

/**
 * Home-market share, reader demand, and editorial priority: an event that a
 * standing beat search brought in — artificial intelligence, startups — is
 * one the desk has said it wants covered in depth, and that is relevance
 * in the plainest sense.
 */
function relevanceFeature(agg: Aggregate, demand: number, onBeat: boolean): number {
  const mix = agg.region_mix ?? {};
  const total = Object.values(mix).reduce((s, n) => s + Number(n), 0);
  const home = total ? Number(mix[HOME_REGION] ?? 0) / total : 0;
  return clamp(home * 6 + Math.min(demand, 4) + (onBeat ? 5 : 0), 0, 10);
}

/** Events with at least one mention from a standing beat search. */
async function loadBeatEvents(): Promise<Set<string>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("signal_mentions")
    .select("event_id")
    .not("raw->beat", "is", null)
    .gte("observed_at", new Date(Date.now() - 48 * 3600_000).toISOString())
    .limit(5000);
  return new Set((data ?? []).map((r) => r.event_id).filter((id): id is string => Boolean(id)));
}

/** 1 minus the strongest entity overlap with anything published in a week. */
function noveltyFeature(agg: Aggregate, recentEntitySets: string[][]): number {
  if (!agg.entities.length) return 10;
  const mine = new Set(agg.entities);
  let worst = 0;
  for (const theirs of recentEntitySets) {
    if (!theirs.length) continue;
    const shared = theirs.filter((k) => mine.has(k)).length;
    const union = new Set([...agg.entities, ...theirs]).size;
    worst = Math.max(worst, shared / union);
  }
  return clamp((1 - worst) * 10, 0, 10);
}

function freshnessFeature(agg: Aggregate): number {
  const hours = (Date.now() - new Date(agg.last_seen_at).getTime()) / 3_600_000;
  return clamp(10 * Math.exp(-hours / 12), 0, 10);
}

// ---------------------------------------------------------------------------
// Combination: Thompson sampling over the learned weights.
// ---------------------------------------------------------------------------

type Weight = { mean: number; variance: number };

/**
 * Evidence features add up; gate features scale the total.
 *
 * Burst, corroboration, authority and the rest are evidence that something is
 * happening, and more of any of them is more reason to write. Novelty and
 * freshness are not evidence of anything: a story we covered yesterday is not
 * more of a story for being an hour old. They are multipliers on the evidence,
 * so a single-source item that happens to be new and recent scores only what
 * its one source is worth — not a bonus for having no history.
 */
export const EVIDENCE_FEATURES: (keyof Features)[] = [
  "burst",
  "surprise",
  "corroboration",
  "lead_authority",
  "acceleration",
  "magnitude",
  "relevance",
  "momentum",
];
export const GATE_FEATURES: (keyof Features)[] = ["novelty", "freshness"];

/** Box–Muller. Fine for this; nobody is cryptographically ranking news. */
function gaussian(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** One draw is kept for a while, so passes a minute apart agree. */
let sampledCache: { key: string; at: number; sampled: Record<keyof Features, number> } | null = null;
const SAMPLE_HOLD_MS = 10 * 60_000;

/**
 * One draw from the weight posterior for the whole pass.
 *
 * Thompson sampling draws a hypothesis and acts on it; the hypothesis has to
 * be the same for every event in the pass or the ranking is noise rather than
 * exploration. With exploration 0 this is the posterior mean, which turns
 * sampling into plain ranking.
 *
 * The draw is held for ten minutes. A fresh draw every minute meant every
 * live event's score changed every minute, so every row was rewritten every
 * minute — a thousand rewrites of rows that carry an embedding, each adding
 * to the vector index, sixty times an hour. Ten minutes of the same
 * hypothesis is still exploration; it is just not churn.
 */
export function sampleWeights(
  weights: Map<string, Weight>,
  exploration: number,
): Record<keyof Features, number> {
  const key = [...weights].map(([k, w]) => `${k}:${w.mean}:${w.variance}`).join("|") + `|${exploration}`;
  if (sampledCache && sampledCache.key === key && Date.now() - sampledCache.at < SAMPLE_HOLD_MS) {
    return sampledCache.sampled;
  }
  const sampled = {} as Record<keyof Features, number>;
  for (const name of FEATURE_NAMES) {
    const w = weights.get(name) ?? { mean: 1, variance: 0.5 };
    sampled[name] = Number((w.mean + gaussian() * Math.sqrt(w.variance) * exploration).toFixed(3));
  }
  sampledCache = { key, at: Date.now(), sampled };
  return sampled;
}

export function combine(features: Features, weights: Record<keyof Features, number>): number {
  let evidence = 0;
  for (const name of EVIDENCE_FEATURES) evidence += weights[name] * features[name];

  // Each gate runs from (1 - weight) at feature 0 up to 1 at feature 10, so a
  // weight of 0.9 on novelty means a story we have fully covered keeps a
  // tenth of its evidence, and a weight of 0 switches the gate off.
  let gate = 1;
  for (const name of GATE_FEATURES) {
    const strength = clamp(weights[name], 0, 1);
    gate *= 1 - strength * (1 - features[name] / 10);
  }

  return Math.max(0, Number((evidence * gate).toFixed(2)));
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

async function loadSourceInfo(keys: string[]): Promise<SourceInfo> {
  const supabase = createAdminClient();
  const hosts = [...new Set(keys)];

  const [authority, stats, pairs] = await Promise.all([
    supabase.from("source_authority").select("host, weight").in("host", hosts),
    supabase.from("source_stats").select("source_key, lead_score").in("source_key", hosts),
    supabase
      .from("source_pairs")
      .select("source_a, source_b, events_a, events_both")
      .in("source_a", hosts)
      .in("source_b", hosts),
  ]);

  return {
    authority: new Map((authority.data ?? []).map((r) => [r.host, Number(r.weight)])),
    lead: new Map((stats.data ?? []).map((r) => [r.source_key, Number(r.lead_score)])),
    pairs: new Map(
      (pairs.data ?? [])
        .filter((r) => r.events_a >= 5)
        .map((r) => [`${r.source_a}|${r.source_b}`, r.events_both / r.events_a]),
    ),
  };
}

/**
 * What the site has already covered this week: the entities of every event
 * the engine wrote, and of every article anyone published by any route —
 * the wire desk, a contributor, an editor. Novelty measured only against the
 * engine's own output would let it write a story the desk ran yesterday.
 */
async function loadRecentEntitySets(): Promise<string[][]> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  const [{ data: events }, { data: linked }] = await Promise.all([
    supabase
      .from("story_events")
      .select("entities")
      .eq("status", "written")
      .gte("last_seen_at", since)
      .limit(200),
    supabase
      .from("article_entities")
      .select("article_id, entities ( slug ), articles!inner ( status, published_at )")
      .eq("articles.status", "published")
      .gte("articles.published_at", since)
      .limit(2000),
  ]);

  const byArticle = new Map<string, string[]>();
  for (const row of linked ?? []) {
    const slug = (row.entities as unknown as { slug: string } | null)?.slug;
    if (!slug) continue;
    const list = byArticle.get(row.article_id) ?? [];
    list.push(slug);
    byArticle.set(row.article_id, list);
  }

  return [...(events ?? []).map((r) => r.entities ?? []), ...byArticle.values()];
}

/**
 * Reader search demand, loaded once per pass.
 *
 * Previously a query per event; with 160 live events that was 160 queries a
 * minute for a table that changes every few minutes. One read, then an
 * in-memory match per event.
 */
type SearchRow = { query: string; zeroResults: boolean };

async function loadSearches(): Promise<SearchRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("analytics_events")
    .select("search_query, properties")
    .eq("event_type", "internal_search")
    .gte("occurred_at", new Date(Date.now() - 7 * 24 * 3600_000).toISOString())
    .limit(500);

  return (data ?? [])
    .filter((row) => row.search_query)
    .map((row) => ({
      query: (row.search_query ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " "),
      zeroResults:
        Number((row.properties as Record<string, unknown> | null)?.result_count ?? 1) === 0,
    }));
}

function demandFor(entities: string[], searches: SearchRow[]): number {
  if (!entities.length) return 0;
  const needles = entities.map((key) => key.replace(/-/g, " "));
  let score = 0;
  for (const row of searches) {
    if (!needles.some((needle) => row.query.includes(needle))) continue;
    score += row.zeroResults ? 3 : 1;
  }
  return score;
}

export type ScoreReport = {
  scored: number;
  written?: number;
  unchanged?: number;
  top: { title: string; score: number }[];
};

/**
 * Recomputes every live event's features and score.
 *
 * Baselines and source information are loaded in bulk for the whole pass, not
 * per event: the pass runs every minute, and a query per event per minute
 * would be most of the database's work.
 */
export async function scoreLiveEvents(): Promise<ScoreReport> {
  const supabase = createAdminClient();

  const { data: rows } = await supabase.rpc("engine_event_aggregates", { p_window_hours: 48 });
  const aggregates = (rows ?? []) as unknown as Aggregate[];
  if (!aggregates.length) return { scored: 0, top: [] };

  const { data: settingRows } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", ["engine_exploration"]);
  const exploration = Number(settingRows?.find((r) => r.key === "engine_exploration")?.value ?? 1);

  const { data: weightRows } = await supabase.from("signal_weights").select("feature, mean, variance");
  const weights = new Map(
    (weightRows ?? []).map((r) => [r.feature, { mean: Number(r.mean), variance: Number(r.variance) }]),
  );

  const allEntities = [...new Set(aggregates.flatMap((a) => a.entities))];
  const { data: baselineRows } = await supabase.rpc("engine_entity_baselines", {
    p_entities: allEntities,
  });
  const baselines = (baselineRows ?? []) as unknown as Baseline[];

  const allSourceKeys = aggregates.flatMap((a) => a.sources.map((s) => s.key));
  const [sourceInfo, recentSets, searches, beatEvents] = await Promise.all([
    loadSourceInfo(allSourceKeys),
    loadRecentEntitySets(),
    loadSearches(),
    loadBeatEvents(),
  ]);

  const results: { title: string; score: number }[] = [];
  const updates: Record<string, unknown>[] = [];

  const sampled = sampleWeights(weights, exploration);

  // What each live event scored last time, so a row is rewritten only when
  // its score or its evidence actually moved. Freshness decays a little every
  // minute; below a tenth of a point that is not worth copying an embedding.
  const previous = new Map<string, { score: number; mentions: number }>();
  for (let i = 0; i < aggregates.length; i += 500) {
    const ids = aggregates.slice(i, i + 500).map((a) => a.event_id);
    const { data: rows } = await supabase
      .from("story_events")
      .select("id, score, mention_count")
      .in("id", ids);
    for (const row of rows ?? []) previous.set(row.id, { score: Number(row.score ?? 0), mentions: row.mention_count });
  }
  let unchanged = 0;

  for (const agg of aggregates) {
    const entityBaselines = baselines.filter((b) => agg.entities.includes(b.entity));
    const effective = independentSources(agg, sourceInfo);
    const demand = demandFor(agg.entities, searches);

    const features: Features = {
      burst: burstFeature(agg, entityBaselines),
      surprise: surpriseFeature(agg, entityBaselines),
      corroboration: corroborationFeature(effective),
      lead_authority: authorityFeature(agg, sourceInfo),
      acceleration: accelerationFeature(agg),
      magnitude: magnitudeFeature(agg),
      relevance: relevanceFeature(agg, demand, beatEvents.has(agg.event_id)),
      novelty: noveltyFeature(agg, recentSets),
      freshness: freshnessFeature(agg),
      momentum: clamp(Number(agg.p_big ?? 0) * 10, 0, 10),
    };

    const score = combine(features, sampled);

    const before = previous.get(agg.event_id);
    if (before && Math.abs(before.score - score) < 0.1 && before.mentions === agg.mentions_total) {
      results.push({ title: agg.title, score: before.score });
      unchanged += 1;
      continue;
    }

    updates.push({
      id: agg.event_id,
      // Required by the insert half of the upsert even though every row exists;
      // Postgres validates the INSERT before taking the ON CONFLICT path.
      title: agg.title,
      burst: features.burst,
      surprise: features.surprise,
      corroboration: features.corroboration,
      lead_authority: features.lead_authority,
      acceleration: features.acceleration,
      magnitude: features.magnitude,
      relevance: features.relevance,
      novelty: features.novelty,
      freshness: features.freshness,
      independent_sources: Number(effective.toFixed(2)),
      score,
      score_breakdown: { features, sampled_weights: sampled },
    });

    results.push({ title: agg.title, score });
  }

  // One round trip for the whole table instead of one per event.
  for (let i = 0; i < updates.length; i += 200) {
    const { error } = await supabase
      .from("story_events")
      .upsert(updates.slice(i, i + 200) as never, { onConflict: "id" });
    if (error) console.error("[score] batch update failed", error.message);
  }

  results.sort((a, b) => b.score - a.score);
  return { scored: results.length, written: updates.length, unchanged, top: results.slice(0, 5) };
}
