import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Earliness: will this become a big story?
 *
 * A logistic regression over what the engine knows in an event's first half
 * hour, trained nightly on six days of free labels (mentions are kept for
 * seven, so older events would look like stories nobody followed) — did the event reach five independent
 * outlets within six hours — that the mention table already holds for every
 * past event. Its output, p_big, is written back to every live event and used
 * three ways: the fast lane (an immediate corroboration search), the order of
 * the corroboration budget, and the momentum signal in the scorer.
 *
 * Kept deliberately small and linear so the Learning page can print the
 * coefficients and a person can argue with them.
 */

const TRAIN_DAYS = 6;
const HOLDOUT_DAYS = 1;
const L2 = 0.01;
const MIN_TRAIN = 300;
const MIN_POSITIVE = 30;
const MIN_AUC = 0.7;

type Row = {
  event_id: string;
  created_at: string;
  n_out_10: number;
  n_out_30: number;
  n_men_30: number;
  first_kind: string | null;
  first_authority: number;
  on_beat: boolean;
  via_top: boolean;
  home_share: number;
  hour_ist: number;
  entity_count: number;
  second_source_at: string | null;
  n_out_6h: number | null;
  big: boolean | null;
};

export const EARLINESS_FEATURES = [
  "outlets_10m",
  "outlets_30m",
  "mentions_30m",
  "first_rss",
  "first_gnews",
  "first_trend",
  "first_authority",
  "on_beat",
  "via_top",
  "home_share",
  "hour_sin",
  "hour_cos",
  "entities",
] as const;

type FeatureName = (typeof EARLINESS_FEATURES)[number];
type Vector = Record<FeatureName, number>;

export type EarlinessModel = {
  coef: Vector;
  intercept: number;
  means: Vector;
  sds: Vector;
};

function vectorOf(row: Row): Vector {
  const kind = row.first_kind ?? "";
  const angle = (2 * Math.PI * Number(row.hour_ist ?? 0)) / 24;
  return {
    outlets_10m: Math.log1p(Number(row.n_out_10)),
    outlets_30m: Math.log1p(Number(row.n_out_30)),
    mentions_30m: Math.log1p(Number(row.n_men_30)),
    first_rss: kind === "rss" ? 1 : 0,
    first_gnews: kind === "gnews" ? 1 : 0,
    first_trend: kind === "trends" || kind === "trend" ? 1 : 0,
    first_authority: Number(row.first_authority ?? 0.8),
    on_beat: row.on_beat ? 1 : 0,
    via_top: row.via_top ? 1 : 0,
    home_share: Number(row.home_share ?? 0),
    hour_sin: Math.sin(angle),
    hour_cos: Math.cos(angle),
    entities: Math.log1p(Number(row.entity_count ?? 0)),
  };
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function predict(model: EarlinessModel, row: Row): number {
  const x = vectorOf(row);
  let z = model.intercept;
  for (const name of EARLINESS_FEATURES) {
    const sd = model.sds[name] || 1;
    z += model.coef[name] * ((x[name] - model.means[name]) / sd);
  }
  return sigmoid(z);
}

function auc(scores: number[], labels: number[]): number {
  const pos: number[] = [];
  const neg: number[] = [];
  scores.forEach((s, i) => (labels[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return 0.5;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/** Standardised logistic regression by gradient descent with L2. */
function train(rows: Row[]): EarlinessModel {
  const xs = rows.map(vectorOf);
  const ys = rows.map((r) => (r.big ? 1 : 0));
  const means = {} as Vector;
  const sds = {} as Vector;
  for (const name of EARLINESS_FEATURES) {
    const values = xs.map((x) => x[name]);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
    means[name] = mean;
    sds[name] = Math.sqrt(variance) || 1;
  }
  const z = xs.map((x) => {
    const out = {} as Vector;
    for (const name of EARLINESS_FEATURES) out[name] = (x[name] - means[name]) / sds[name];
    return out;
  });

  const coef = {} as Vector;
  for (const name of EARLINESS_FEATURES) coef[name] = 0;
  let intercept = Math.log((ys.filter(Boolean).length + 1) / (ys.length - ys.filter(Boolean).length + 1));
  const rate = 0.1;

  for (let iter = 0; iter < 600; iter++) {
    const grad = {} as Vector;
    for (const name of EARLINESS_FEATURES) grad[name] = 0;
    let gradB = 0;
    for (let i = 0; i < z.length; i++) {
      let s = intercept;
      for (const name of EARLINESS_FEATURES) s += coef[name] * z[i][name];
      const err = sigmoid(s) - ys[i];
      for (const name of EARLINESS_FEATURES) grad[name] += err * z[i][name];
      gradB += err;
    }
    for (const name of EARLINESS_FEATURES) {
      coef[name] -= rate * (grad[name] / z.length + L2 * coef[name]);
    }
    intercept -= rate * (gradB / z.length);
  }
  return { coef, intercept, means, sds };
}

export type EarlinessFitReport = {
  status: "promoted" | "held" | "insufficient";
  train: number;
  positives: number;
  holdout: number;
  auc: number | null;
  liveAuc: number | null;
  versionId: number | null;
};

async function loadPromotedModel(): Promise<{ id: number; model: EarlinessModel } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("model_versions")
    .select("id, weights")
    .eq("kind", "earliness")
    .eq("promoted", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, model: data.weights as unknown as EarlinessModel };
}

export async function fitEarlinessModel(): Promise<EarlinessFitReport> {
  const supabase = createAdminClient();
  const now = Date.now();
  const from = new Date(now - TRAIN_DAYS * 24 * 3600_000).toISOString();
  // Labels need six hours to settle, and two hours' grace for late mentions.
  const to = new Date(now - 8 * 3600_000).toISOString();

  const { data, error } = await supabase.rpc("engine_earliness_json", {
    p_from: from,
    p_to: to,
    p_with_label: true,
  });
  if (error) throw new Error(`earliness rows: ${error.message}`);
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.big !== null);

  const cutoff = now - (HOLDOUT_DAYS * 24 + 8) * 3600_000;
  const trainRows = rows.filter((r) => new Date(r.created_at).getTime() < cutoff);
  const holdRows = rows.filter((r) => new Date(r.created_at).getTime() >= cutoff);
  const positives = trainRows.filter((r) => r.big).length;

  if (trainRows.length < MIN_TRAIN || positives < MIN_POSITIVE || holdRows.length < 50 || !holdRows.some((r) => r.big)) {
    return { status: "insufficient", train: trainRows.length, positives, holdout: holdRows.length, auc: null, liveAuc: null, versionId: null };
  }

  const model = train(trainRows);
  const holdLabels = holdRows.map((r) => (r.big ? 1 : 0));
  const newAuc = auc(holdRows.map((r) => predict(model, r)), holdLabels);
  const live = await loadPromotedModel();
  const liveAuc = live ? auc(holdRows.map((r) => predict(live.model, r)), holdLabels) : null;

  const promote = newAuc >= MIN_AUC && (liveAuc === null || newAuc >= liveAuc - 0.01);

  const { data: version } = await supabase
    .from("model_versions")
    .insert({
      kind: "earliness",
      weights: model as never,
      metrics: { status: promote ? "promoted" : "held", auc: newAuc, liveAuc, train: trainRows.length, positives, holdout: holdRows.length } as never,
      examples: trainRows.length,
      promoted: promote,
      notes: promote ? "Meets the AUC floor and the live model." : "Below the AUC floor or worse than the live model.",
    })
    .select("id")
    .single();

  return { status: promote ? "promoted" : "held", train: trainRows.length, positives, holdout: holdRows.length, auc: newAuc, liveAuc, versionId: version?.id ?? null };
}

/**
 * Writes p_big and the second-source clock onto every event seen in the
 * last six hours. Cheap: one function call and one batched update.
 */
export async function scoreEarliness(): Promise<{ scored: number; modelVersion: number | null }> {
  const supabase = createAdminClient();
  const live = await loadPromotedModel();

  const { data, error } = await supabase.rpc("engine_earliness_json", {
    p_from: new Date(Date.now() - 6 * 3600_000).toISOString(),
    p_to: new Date(Date.now() + 60_000).toISOString(),
    p_with_label: false,
  });
  if (error) throw new Error(`earliness rows: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return { scored: 0, modelVersion: live?.id ?? null };

  const at = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    // One update per row keeps this free of the upsert's insert validation;
    // two hundred cheap updates a minute is well within budget.
    await Promise.all(
      batch.map((row) =>
        supabase
          .from("story_events")
          .update({
            p_big: live ? Number(predict(live.model, row).toFixed(4)) : null,
            p_big_at: at,
            second_source_at: row.second_source_at,
          })
          .eq("id", row.event_id),
      ),
    );
  }
  return { scored: rows.length, modelVersion: live?.id ?? null };
}
