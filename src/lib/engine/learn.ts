import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { EVIDENCE_FEATURES, FEATURE_NAMES, GATE_FEATURES, combine, type Features } from "./score";

/**
 * Learning the weights.
 *
 * A Bayesian linear model with a diagonal Gaussian posterior over the nine
 * feature weights. Each labelled outcome — an editor's decision, a completion
 * rate, a follow-on from the wider press — moves the weights towards whatever
 * would have predicted it, by an amount that shrinks as the evidence
 * accumulates. Scoring samples from this posterior (Thompson sampling), so
 * uncertain weights keep getting tested and confident ones settle.
 *
 * Coordinate-wise updates rather than a full covariance matrix. Nine
 * features, a few hundred labels a week: the full Bayesian regression would be
 * more exact and no more useful, and this one can be read out of a table.
 *
 * Labels come from two places, deliberately independent of each other:
 *   editor  — accepted or sent back on the desk (1 / 0)
 *   outlet  — did other outlets carry it after we did (1 / 0)
 * A reader label (completion rate) existed and was retired: with no audience
 * yet, twenty sessions on a story is noise dressed as a verdict, and a label
 * that can be wrong quietly is worse than none.
 *
 * The whole loop sits behind the engine_learning_enabled setting. Off, the
 * weights hold still: labels are neither harvested nor applied. It is off
 * while the label itself is being redesigned, because the outlet label as
 * written scored well-covered Indian stories as misses and dragged every
 * evidence weight to its floor, twice.
 */

async function learningEnabled(): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "engine_learning_enabled")
    .maybeSingle();
  return data?.value === true;
}

/**
 * Observation noise. Labels are noisy and, worse, can be systematically wrong
 * for a while — twenty-eight bad "outlet" zeros once drove corroboration to
 * nothing in a single pass. Each label now moves a weight a little; it takes
 * hundreds agreeing to move it far.
 */
const NOISE_VARIANCE = 2.0;
/** Floors, so a weight never becomes certain enough to stop being explored. */
const MIN_VARIANCE = 0.02;
const MAX_ABS_WEIGHT = 4;
/** Evidence weights stay positive: more corroboration is never a reason to bury a story. */
const MIN_EVIDENCE_WEIGHT = 0.1;
/** No learning from a batch that says the same thing about everything. */
const MIN_BATCH = 5;

type Weight = { mean: number; variance: number; observations: number };

/**
 * Records an outcome against an event, snapshotting the features the engine
 * saw when it made its decision.
 *
 * The snapshot matters. By the time a reader finishes an article the event's
 * live features have moved on; learning from those would teach the model what
 * a story looks like after it has been covered, not what it looked like when
 * the choice was made.
 */
export async function recordOutcome(
  eventId: string,
  labelSource: "editor" | "reader" | "outlet",
  label: number,
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: event } = await supabase
    .from("story_events")
    .select("score_breakdown")
    .eq("id", eventId)
    .maybeSingle();

  const breakdown = (event?.score_breakdown as { features?: Features } | null) ?? null;
  if (!breakdown?.features) return false;

  const { error } = await supabase.from("event_outcomes").insert({
    event_id: eventId,
    label_source: labelSource,
    label: Math.max(0, Math.min(1, label)),
    features: breakdown.features as never,
  });

  return !error;
}

/**
 * One Bayesian update of one weight from one observation.
 *
 * Standard conjugate update for a Gaussian prior on a coefficient with a
 * Gaussian likelihood on the residual: precision adds, mean moves towards the
 * least-squares solution in proportion to how much the feature was present.
 */
function updateWeight(
  weight: Weight,
  feature: number,
  residual: number,
): Weight {
  if (feature === 0) return weight;

  const priorPrecision = 1 / weight.variance;
  const dataPrecision = (feature * feature) / NOISE_VARIANCE;
  const posteriorPrecision = priorPrecision + dataPrecision;

  // The residual is what this weight alone would need to explain, spread over
  // the features present; feature/NOISE scales it into precision units.
  const posteriorMean =
    (priorPrecision * weight.mean + (feature * residual) / NOISE_VARIANCE) / posteriorPrecision;

  return {
    mean: Math.max(-MAX_ABS_WEIGHT, Math.min(MAX_ABS_WEIGHT, posteriorMean)),
    variance: Math.max(MIN_VARIANCE, 1 / posteriorPrecision),
    observations: weight.observations + 1,
  };
}

export type LearnReport = { outcomes: number; weights: Record<string, { mean: number; variance: number }> };

/**
 * Applies every outcome not yet learned from.
 *
 * Features are scaled to 0..1 before the update, so a weight's magnitude is
 * comparable across features and the noise term means the same thing for all
 * of them. The label is compared with the model's own prediction; only the
 * residual moves anything.
 */
export async function applyOutcomes(): Promise<LearnReport> {
  const supabase = createAdminClient();
  const enabled = await learningEnabled();

  const { data: weightRows } = await supabase
    .from("signal_weights")
    .select("feature, mean, variance, observations");
  const weights = new Map<string, Weight>(
    (weightRows ?? []).map((r) => [
      r.feature,
      { mean: Number(r.mean), variance: Number(r.variance), observations: r.observations },
    ]),
  );

  const { data: outcomes } = await supabase
    .from("event_outcomes")
    .select("id, label, features")
    .eq("applied", false)
    .order("created_at", { ascending: true })
    .limit(500);

  // The logistic is centred where triage begins: an event scoring exactly at
  // the threshold is a coin toss, well above it a likely yes.
  const { data: thresholdRow } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "engine_triage_threshold")
    .maybeSingle();
  const centre = Number(thresholdRow?.value ?? 18);

  const summary = () =>
    Object.fromEntries([...weights].map(([k, w]) => [k, { mean: w.mean, variance: w.variance }]));

  if (!enabled || !outcomes?.length) return { outcomes: 0, weights: summary() };

  // A batch of identical labels carries no information about which features
  // matter — only that the desk was right or wrong about everything — and
  // applying it moves every weight in the same direction. Wait for contrast.
  const labels = outcomes.map((o) => Number(o.label));
  if (outcomes.length < MIN_BATCH || Math.max(...labels) - Math.min(...labels) < 0.3) {
    return { outcomes: 0, weights: summary() };
  }

  for (const outcome of outcomes) {
    const raw = outcome.features as Partial<Features>;
    const features = Object.fromEntries(
      FEATURE_NAMES.map((name) => [name, Number(raw[name] ?? 0)]),
    ) as Features;

    // The score the current means would give this event, mapped to 0..1
    // through a logistic centred on the triage threshold, so it is comparable
    // with the label. Only the residual moves anything.
    const means = Object.fromEntries(
      FEATURE_NAMES.map((name) => [name, weights.get(name)?.mean ?? 1]),
    ) as Record<keyof Features, number>;
    const predicted = 1 / (1 + Math.exp(-(combine(features, means) - centre) / 8));
    const residual = Number(outcome.label) - predicted;

    // Evidence weights: more of the feature should have meant a higher label.
    for (const name of EVIDENCE_FEATURES) {
      const current = weights.get(name) ?? { mean: 1, variance: 0.5, observations: 0 };
      const updated = updateWeight(current, features[name] / 10, residual);
      weights.set(name, { ...updated, mean: Math.max(MIN_EVIDENCE_WEIGHT, updated.mean) });
    }

    // Gate weights run the other way. A gate penalises the absence of its
    // feature, so if a low-novelty story turned out well the penalty was too
    // strong and the weight should fall. Gates stay within 0..1.
    for (const name of GATE_FEATURES) {
      const current = weights.get(name) ?? { mean: 0.5, variance: 0.5, observations: 0 };
      const updated = updateWeight(current, 1 - features[name] / 10, -residual);
      weights.set(name, { ...updated, mean: Math.max(0, Math.min(1, updated.mean)) });
    }
  }

  for (const [feature, weight] of weights) {
    await supabase
      .from("signal_weights")
      .update({
        mean: Number(weight.mean.toFixed(4)),
        variance: Number(weight.variance.toFixed(4)),
        observations: weight.observations,
        updated_at: new Date().toISOString(),
      })
      .eq("feature", feature);
  }

  await supabase
    .from("event_outcomes")
    .update({ applied: true })
    .in("id", outcomes.map((o) => o.id));

  return {
    outcomes: outcomes.length,
    weights: Object.fromEntries(
      [...weights].map(([k, w]) => [k, { mean: Number(w.mean.toFixed(3)), variance: Number(w.variance.toFixed(3)) }]),
    ),
  };
}

/**
 * Harvests labels the engine can collect for itself.
 *
 *   outlet — an event we wrote that authoritative outlets subsequently joined
 *            is a hit; one nobody else ever covered is a miss. Both are
 *            decided a few hours after writing, once the press has had time.
 */
export async function harvestLabels(): Promise<{ outlet: number }> {
  const supabase = createAdminClient();
  const counts = { outlet: 0 };
  if (!(await learningEnabled())) return counts;

  // Judged four hours after the article existed, from everything on the
  // event by then — not only what arrived after our write. A story eight
  // outlets carried before we wrote it is a hit; measuring only what came
  // later called every such story a miss and taught the weights nonsense.
  const cutoff = new Date(Date.now() - 4 * 3600_000).toISOString();
  const { data: written } = await supabase
    .from("story_events")
    .select("id, article_id, articles!inner ( created_at )")
    .eq("status", "written")
    .lte("articles.created_at", cutoff)
    .gte("articles.created_at", new Date(Date.now() - 48 * 3600_000).toISOString())
    .limit(50);

  const { data: authorityRows } = await supabase.from("source_authority").select("host, weight");
  const authority = new Map((authorityRows ?? []).map((a) => [a.host, Number(a.weight)]));

  for (const event of written ?? []) {
    const { data: already } = await supabase
      .from("event_outcomes")
      .select("label_source")
      .eq("event_id", event.id);
    const have = new Set((already ?? []).map((r) => r.label_source));

    if (!have.has("outlet")) {
      const { data: mentions } = await supabase
        .from("signal_mentions")
        .select("source_key")
        .eq("event_id", event.id);
      const outlets = new Set((mentions ?? []).map((m) => m.source_key));
      const strong = [...outlets].filter((host) => (authority.get(host) ?? 0) >= 1.5).length;

      if (await recordOutcome(event.id, "outlet", strong >= 2 ? 1 : 0)) counts.outlet += 1;
    }
  }

  return counts;
}
