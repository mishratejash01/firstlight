import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { FEATURE_NAMES, combine, type Features } from "./score";

/**
 * The daily fit of the selection weights.
 *
 * Replaces the drip learner that moved a weight on every label and was
 * rewritten by one bad batch, twice. This one:
 *
 *   batch      fits all labelled events of the last thirty days at once, on
 *              the signals snapshotted when the desk decided
 *   anchored   a Gaussian prior centred on the fitted harness weights, and a
 *              hard clamp of a quarter to four times the anchor, so data can
 *              move the model and cannot flip it
 *   blended    reviewer verdicts, outlet follow-through, missed-story verdicts
 *              and editor decisions are all examples of one target, each with
 *              its own weight; no single source can dominate, and no single
 *              review moves anything on its own
 *   gated      the new weights are scored against the live ones on the most
 *              recent day, which was held out of the fit, and go live only if
 *              they win on ranking quality and on precision at the top
 *   stepped    a promotion moves each weight at most 35 per cent from its live
 *              value, so the model walks towards the data over nights rather
 *              than jumping on one
 *   monitored  a label source whose day's mean drifts far from its own week is
 *              left out of the fit, and the Learning page says so
 *
 * The model is the scorer's own formula — evidence times gates — pushed
 * through a logistic link, so what is fitted is exactly what is used.
 */

const WINDOW_DAYS = 30;
const HOLDOUT_HOURS = 24;
const PRIOR_VARIANCE = 0.15;
/** How much the prior counts against the mean data loss. */
const PRIOR_STRENGTH = 0.05;
const CLAMP_LOW = 0.25;
const CLAMP_HIGH = 4;
/** How far one night's promotion may move a weight from the live value. */
const MAX_STEP = 0.35;
const MIN_TRAIN = 60;
const MIN_CLASS = 15;
const MIN_HOLDOUT = 20;
const DRIFT_LIMIT = 0.2;
const TOP_K = 30;

type Example = {
  features: Features;
  label: number;
  weight: number;
  source: string;
  createdAt: number;
};

type Params = { weights: Record<keyof Features, number>; a: number; b: number };

type OutcomeRow = {
  label: number;
  label_source: string;
  features: Record<string, unknown> | null;
  weight: number | null;
  created_at: string;
};

export type FitReport = {
  status: "promoted" | "held" | "insufficient" | "disabled";
  examples: number;
  holdout: number;
  excludedSources: string[];
  live: { auc: number; precisionAtK: number } | null;
  fitted: { auc: number; precisionAtK: number } | null;
  weights: Record<string, number>;
  versionId: number | null;
};

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function toFeatures(raw: Record<string, unknown> | null): Features | null {
  if (!raw) return null;
  const out = {} as Features;
  for (const name of FEATURE_NAMES) out[name] = Number(raw[name] ?? 0);
  return out;
}

/** Ranking quality: probability a random positive outranks a random negative. */
function auc(scores: number[], labels: number[]): number {
  const pos: number[] = [];
  const neg: number[] = [];
  scores.forEach((s, i) => (labels[i] >= 0.5 ? pos : neg).push(s));
  if (!pos.length || !neg.length) return 0.5;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/** Share of positives among the top K by score. */
function precisionAtK(scores: number[], labels: number[], k: number): number {
  const order = scores.map((s, i) => i).sort((i, j) => scores[j] - scores[i]);
  const top = order.slice(0, Math.min(k, order.length));
  if (!top.length) return 0;
  return top.filter((i) => labels[i] >= 0.5).length / top.length;
}

function clampToAnchor(value: number, anchor: number): number {
  if (anchor <= 0) return Math.max(0, Math.min(1, value));
  return Math.max(anchor * CLAMP_LOW, Math.min(anchor * CLAMP_HIGH, value));
}

function objective(params: Params, examples: Example[], anchors: Record<string, number>): number {
  let loss = 0;
  let mass = 0;
  for (const ex of examples) {
    const p = Math.min(1 - 1e-6, Math.max(1e-6, sigmoid(params.a * combine(ex.features, params.weights) + params.b)));
    loss += -ex.weight * (ex.label * Math.log(p) + (1 - ex.label) * Math.log(1 - p));
    mass += ex.weight;
  }
  let prior = 0;
  for (const name of FEATURE_NAMES) {
    const d = params.weights[name] - (anchors[name] ?? 0);
    prior += (d * d) / (2 * PRIOR_VARIANCE);
  }
  return loss / Math.max(mass, 1) + PRIOR_STRENGTH * prior;
}

/**
 * Gradient descent with numerical gradients. Eleven parameters and a few
 * thousand examples: a closed form would be no faster to run and slower to
 * get right, since the gates make the model non-linear in its weights.
 */
function fit(examples: Example[], anchors: Record<string, number>, start: Params): Params {
  const params: Params = { weights: { ...start.weights }, a: start.a, b: start.b };
  const keys = FEATURE_NAMES as (keyof Features)[];
  let step = 0.05;
  let current = objective(params, examples, anchors);

  for (let iter = 0; iter < 400; iter++) {
    const grad: Params = { weights: {} as Record<keyof Features, number>, a: 0, b: 0 };
    const h = 1e-3;
    for (const key of keys) {
      const saved = params.weights[key];
      params.weights[key] = saved + h;
      const up = objective(params, examples, anchors);
      params.weights[key] = saved - h;
      const down = objective(params, examples, anchors);
      params.weights[key] = saved;
      grad.weights[key] = (up - down) / (2 * h);
    }
    for (const key of ["a", "b"] as const) {
      const saved = params[key];
      params[key] = saved + h;
      const up = objective(params, examples, anchors);
      params[key] = saved - h;
      const down = objective(params, examples, anchors);
      params[key] = saved;
      grad[key] = (up - down) / (2 * h);
    }

    // Backtracking: shrink the step until the objective falls.
    let improved = false;
    for (let tries = 0; tries < 8 && !improved; tries++) {
      const trial: Params = { weights: {} as Record<keyof Features, number>, a: params.a - step * grad.a, b: params.b - step * grad.b };
      for (const key of keys) {
        trial.weights[key] = clampToAnchor(params.weights[key] - step * grad.weights[key], anchors[key] ?? 0);
      }
      const value = objective(trial, examples, anchors);
      if (value < current) {
        params.weights = trial.weights;
        params.a = trial.a;
        params.b = trial.b;
        current = value;
        improved = true;
        step *= 1.1;
      } else {
        step *= 0.5;
      }
    }
    if (!improved || step < 1e-6) break;
  }
  return params;
}

/** A label source whose day disagrees with its own week is left out. */
function driftingSources(examples: Example[], now: number): string[] {
  const day = now - 24 * 3600_000;
  const week = now - 8 * 24 * 3600_000;
  const out: string[] = [];
  const sources = [...new Set(examples.map((e) => e.source))];
  for (const source of sources) {
    const recent = examples.filter((e) => e.source === source && e.createdAt >= day);
    const prior = examples.filter((e) => e.source === source && e.createdAt < day && e.createdAt >= week);
    if (recent.length < 10 || prior.length < 20) continue;
    const mean = (rows: Example[]) => rows.reduce((s, e) => s + e.label, 0) / rows.length;
    if (Math.abs(mean(recent) - mean(prior)) > DRIFT_LIMIT) out.push(source);
  }
  return out;
}

export async function fitSelectionWeights(): Promise<FitReport> {
  const supabase = createAdminClient();
  const now = Date.now();

  const [{ data: weightRows }, { data: setting }, { data: outcomeRows }] = await Promise.all([
    supabase.from("signal_weights").select("feature, mean, variance, observations, anchor"),
    supabase.from("site_settings").select("value").eq("key", "engine_learning_enabled").maybeSingle(),
    // One JSON document rather than rows: PostgREST caps a query at a
    // thousand rows, and a fit on the wrong thousand is worse than none.
    supabase.rpc("engine_training_outcomes_json", { p_days: WINDOW_DAYS }),
  ]);
  const enabled = setting?.value === true;

  const live = {} as Record<keyof Features, number>;
  const anchors: Record<string, number> = {};
  for (const name of FEATURE_NAMES) {
    const row = (weightRows ?? []).find((r) => r.feature === name);
    live[name] = Number(row?.mean ?? 1);
    anchors[name] = Number(row?.anchor ?? row?.mean ?? 1);
  }
  const current = Object.fromEntries(FEATURE_NAMES.map((n) => [n, live[n]]));

  const all: Example[] = [];
  for (const row of ((outcomeRows ?? []) as unknown as OutcomeRow[])) {
    const features = toFeatures(row.features);
    if (!features) continue;
    all.push({
      features,
      label: Math.max(0, Math.min(1, Number(row.label))),
      weight: Math.max(0.1, Number(row.weight ?? 1)),
      source: row.label_source,
      createdAt: new Date(row.created_at).getTime(),
    });
  }

  const excludedSources = driftingSources(all, now);
  const usable = all.filter((e) => !excludedSources.includes(e.source));
  const cutoff = now - HOLDOUT_HOURS * 3600_000;
  const train = usable.filter((e) => e.createdAt < cutoff);
  const holdout = usable.filter((e) => e.createdAt >= cutoff);

  const positives = train.filter((e) => e.label >= 0.5).length;
  const negatives = train.length - positives;
  const holdPos = holdout.filter((e) => e.label >= 0.5).length;

  const base: Omit<FitReport, "status" | "versionId"> = {
    examples: train.length,
    holdout: holdout.length,
    excludedSources,
    live: null,
    fitted: null,
    weights: current,
  };

  if (!enabled) {
    return { ...base, status: "disabled", versionId: null };
  }
  if (
    train.length < MIN_TRAIN ||
    positives < MIN_CLASS ||
    negatives < MIN_CLASS ||
    holdout.length < MIN_HOLDOUT ||
    holdPos === 0 ||
    holdPos === holdout.length
  ) {
    const { data: row } = await supabase
      .from("model_versions")
      .insert({
        kind: "selection",
        weights: current as never,
        metrics: { status: "insufficient", train: train.length, positives, negatives, holdout: holdout.length, excludedSources } as never,
        examples: train.length,
        promoted: false,
        notes: "Not enough labelled examples with both outcomes to fit and evaluate.",
      })
      .select("id")
      .single();
    return { ...base, status: "insufficient", versionId: row?.id ?? null };
  }

  // Start from the live weights; the link's scale and offset start where a
  // score at the triage line is a coin toss.
  const fitted = fit(train, anchors, { weights: { ...live }, a: 1 / 8, b: -12 / 8 });

  // One night, one step. What is evaluated is what would go live.
  for (const name of FEATURE_NAMES) {
    const floor = live[name] * (1 - MAX_STEP);
    const ceiling = live[name] * (1 + MAX_STEP);
    fitted.weights[name] = Math.max(floor, Math.min(ceiling, fitted.weights[name]));
  }

  const holdLabels = holdout.map((e) => e.label);
  const liveScores = holdout.map((e) => combine(e.features, live));
  const newScores = holdout.map((e) => combine(e.features, fitted.weights));
  const liveMetrics = { auc: auc(liveScores, holdLabels), precisionAtK: precisionAtK(liveScores, holdLabels, TOP_K) };
  const newMetrics = { auc: auc(newScores, holdLabels), precisionAtK: precisionAtK(newScores, holdLabels, TOP_K) };

  const wins = newMetrics.auc >= liveMetrics.auc + 0.005 && newMetrics.precisionAtK >= liveMetrics.precisionAtK - 0.001;
  const rounded = Object.fromEntries(
    FEATURE_NAMES.map((n) => [n, Number(fitted.weights[n].toFixed(4))]),
  ) as Record<string, number>;

  const { data: version } = await supabase
    .from("model_versions")
    .insert({
      kind: "selection",
      weights: rounded as never,
      metrics: {
        status: wins ? "promoted" : "held",
        live: liveMetrics,
        fitted: newMetrics,
        train: train.length,
        positives,
        negatives,
        holdout: holdout.length,
        excludedSources,
        link: { a: Number(fitted.a.toFixed(4)), b: Number(fitted.b.toFixed(4)) },
      } as never,
      examples: train.length,
      promoted: wins,
      notes: wins
        ? "Beat the live weights on the held-out day."
        : "Did not beat the live weights on the held-out day; nothing changed.",
    })
    .select("id")
    .single();

  if (wins) {
    for (const name of FEATURE_NAMES) {
      await supabase
        .from("signal_weights")
        .update({
          mean: rounded[name],
          variance: 0.1,
          observations: train.length,
          updated_at: new Date().toISOString(),
        })
        .eq("feature", name);
    }
  }

  return {
    ...base,
    status: wins ? "promoted" : "held",
    live: liveMetrics,
    fitted: newMetrics,
    weights: wins ? rounded : current,
    versionId: version?.id ?? null,
  };
}

/** Puts an earlier version's weights back, recorded as a new promoted version. */
export async function rollbackSelectionWeights(versionId: number): Promise<{ ok: true } | { error: string }> {
  const supabase = createAdminClient();
  const { data: version } = await supabase
    .from("model_versions")
    .select("id, kind, weights")
    .eq("id", versionId)
    .maybeSingle();
  if (!version || version.kind !== "selection") return { error: "No such selection model version." };

  const weights = version.weights as Record<string, number>;
  for (const name of FEATURE_NAMES) {
    if (typeof weights[name] !== "number") continue;
    await supabase
      .from("signal_weights")
      .update({ mean: weights[name], variance: 0.1, updated_at: new Date().toISOString() })
      .eq("feature", name);
  }
  await supabase.from("model_versions").insert({
    kind: "selection",
    weights: weights as never,
    metrics: { status: "rollback", from: version.id } as never,
    promoted: true,
    notes: `Rolled back to version ${version.id} by an administrator.`,
  });
  return { ok: true };
}
