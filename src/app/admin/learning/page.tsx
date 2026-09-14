import type { Metadata } from "next";

import { ActionButton } from "@/components/dashboard/action-button";
import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/format/datetime";
import { EARLINESS_FEATURES, type EarlinessModel } from "@/lib/engine/earliness";
import { harvestNow, rollbackWeights, runFitNow, setLearningEnabled } from "@/app/admin/learning-actions";

export const metadata: Metadata = {
  title: "Learning — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const FEATURE_LABELS: Record<string, string> = {
  burst: "Burst",
  surprise: "Surprise",
  corroboration: "Corroboration",
  lead_authority: "Lead authority",
  acceleration: "Acceleration",
  magnitude: "Magnitude",
  relevance: "Relevance",
  novelty: "Novelty (gate)",
  freshness: "Freshness (gate)",
  momentum: "Momentum (earliness)",
};

const SOURCE_LABELS: Record<string, string> = {
  reviewer: "Reviewer verdicts",
  missed: "Missed-story verdicts",
  outlet_4h: "Outlets followed within 4h",
  outlet_24h: "Outlets followed within 24h",
  editor: "Editor decisions",
  outlet: "Old outlet label (retired)",
  reader: "Reader completion (retired)",
};

function pct(value: number | null | undefined, digits = 0): string {
  if (value == null) return "";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 0): string {
  if (value == null) return "";
  return Number(value).toFixed(digits);
}

/**
 * What the engine is learning, from whom, and whether it is allowed to act
 * on it. Every number is read from the database when the page loads.
 */
export default async function AdminLearningPage() {
  const user = await requireAdmin("/admin/learning");
  const supabase = await createClient();
  const admin = createAdminClient();

  const [
    { data: setting },
    { data: ledger },
    { data: weights },
    { data: drift },
    { data: versions },
    { data: reviewers },
    { data: counts },
  ] = await Promise.all([
    supabase.from("site_settings").select("value").eq("key", "engine_learning_enabled").maybeSingle(),
    supabase.rpc("engine_learning_ledger", { p_days: 14 }),
    admin.from("signal_weights").select("feature, mean, variance, observations, anchor, updated_at").order("feature"),
    supabase.rpc("engine_label_drift"),
    supabase.from("model_versions").select("id, kind, created_at, weights, metrics, examples, promoted, notes").order("created_at", { ascending: false }).limit(20),
    supabase.rpc("engine_reviewer_stats"),
    admin.rpc("engine_learning_ledger", { p_days: 1 }),
  ]);
  void counts;

  const enabled = setting?.value === true;
  const promotedSelection = (versions ?? []).find((v) => v.kind === "selection" && v.promoted) ?? null;
  const promotedEarliness = (versions ?? []).find((v) => v.kind === "earliness" && v.promoted) ?? null;
  const earlinessModel = (promotedEarliness?.weights as unknown as EarlinessModel | null) ?? null;

  return (
    <DashboardShell
      user={user}
      title="Learning"
      standfirst="What the engine is learning, from whom, and whether it may act on it."
    >
      <AdminNav current="/admin/learning" />

      <section className="pt-8">
        <p className="text-lead text-ink">
          Learner: <span className="font-semibold">{enabled ? "ON" : "OFF"}</span>
        </p>
        <p className="mt-1 max-w-measure text-body text-muted">
          {enabled
            ? "The nightly fit may replace the live weights when the new ones beat them on the held-out day."
            : "Fits run and are recorded every night, but the live weights hold still. Turn on once a fit has been promoted at least once by hand and looked sensible."}
          {promotedSelection ? ` Live selection weights: version ${promotedSelection.id}, ${formatDateTime(promotedSelection.created_at)}.` : " Live selection weights: the fitted anchors."}
          {promotedEarliness ? ` Earliness model: version ${promotedEarliness.id}.` : " Earliness model: none yet."}
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <ActionButton
            action={setLearningEnabled}
            hidden={{ enabled: enabled ? "false" : "true" }}
            label={enabled ? "Turn learner OFF" : "Turn learner ON"}
            pendingLabel="Updating…"
            variant="primary"
          />
          <ActionButton action={runFitNow} hidden={{}} label="Run the fit now" pendingLabel="Fitting…" />
          <ActionButton action={harvestNow} hidden={{}} label="Harvest labels and build today's missed sample" pendingLabel="Harvesting…" />
        </div>
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">The ledger, last 14 days</h2>
        <p className="mt-1 max-w-measure text-meta text-muted">
          Stories written by the engine per day, what reviewers made of them, what the desk considered, and how quick it was.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-meta">
            <thead>
              <tr className="border-b border-hairline text-left text-muted">
                <th className="py-2 pr-3 font-normal">Day</th>
                <th className="py-2 pr-3 text-right font-normal">Written</th>
                <th className="py-2 pr-3 text-right font-normal">Reviewed</th>
                <th className="py-2 pr-3 text-right font-normal">Importance 4+</th>
                <th className="py-2 pr-3 text-right font-normal">Would not run</th>
                <th className="py-2 pr-3 text-right font-normal">Late or stale</th>
                <th className="py-2 pr-3 text-right font-normal">Missed sampled</th>
                <th className="py-2 pr-3 text-right font-normal">Should have written</th>
                <th className="py-2 pr-3 text-right font-normal">Triaged</th>
                <th className="py-2 pr-3 text-right font-normal">Accepted</th>
                <th className="py-2 pr-3 text-right font-normal">Sighting to publish</th>
                <th className="py-2 pr-3 text-right font-normal">Discovery lag</th>
                <th className="py-2 text-right font-normal">Outlets 4h</th>
              </tr>
            </thead>
            <tbody>
              {(ledger ?? []).map((row) => (
                <tr key={String(row.day)} className="border-b border-hairline">
                  <td className="py-2 pr-3 text-ink">{String(row.day)}</td>
                  <td className="py-2 pr-3 text-right text-ink">{row.written}</td>
                  <td className="py-2 pr-3 text-right text-ink">{row.reviewed}</td>
                  <td className="py-2 pr-3 text-right text-ink">{pct(row.importance_high_share)}</td>
                  <td className="py-2 pr-3 text-right text-ink">{pct(row.would_not_run_share, 1)}</td>
                  <td className="py-2 pr-3 text-right text-ink">{pct(row.late_share)}</td>
                  <td className="py-2 pr-3 text-right text-ink">{row.missed_sampled}</td>
                  <td className="py-2 pr-3 text-right text-ink">{pct(row.missed_should_have_share)}</td>
                  <td className="py-2 pr-3 text-right text-ink">{row.triage_considered}</td>
                  <td className="py-2 pr-3 text-right text-ink">{row.triage_accepted}</td>
                  <td className="py-2 pr-3 text-right text-ink">{row.median_sighting_to_publish_min != null ? `${num(row.median_sighting_to_publish_min)} min` : ""}</td>
                  <td className="py-2 pr-3 text-right text-ink">{row.median_discovery_lag_min != null ? `${num(row.median_discovery_lag_min)} min` : ""}</td>
                  <td className="py-2 text-right text-ink">{num(row.outlet_4h_mean, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Live weights against their anchors</h2>
        <p className="mt-1 max-w-measure text-meta text-muted">
          A fit may move a weight between a quarter and four times its anchor. A weight at a clamp is a question to answer, not a setting to accept.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-meta">
            <thead>
              <tr className="border-b border-hairline text-left text-muted">
                <th className="py-2 pr-4 font-normal">Signal</th>
                <th className="py-2 pr-4 text-right font-normal">Live</th>
                <th className="py-2 pr-4 text-right font-normal">Anchor</th>
                <th className="py-2 pr-4 text-right font-normal">Allowed</th>
                <th className="py-2 pr-4 text-right font-normal">Examples</th>
                <th className="py-2 font-normal">Updated</th>
              </tr>
            </thead>
            <tbody>
              {(weights ?? []).map((w) => {
                const anchor = Number(w.anchor ?? w.mean);
                const live = Number(w.mean);
                const low = anchor * 0.25;
                const high = anchor * 4;
                const atClamp = anchor > 0 && (live <= low * 1.02 || live >= high * 0.98);
                return (
                  <tr key={w.feature} className="border-b border-hairline">
                    <td className="py-2 pr-4 text-ink">{FEATURE_LABELS[w.feature] ?? w.feature}</td>
                    <td className={atClamp ? "py-2 pr-4 text-right text-signal" : "py-2 pr-4 text-right text-ink"}>{num(live, 3)}{atClamp ? " (at clamp)" : ""}</td>
                    <td className="py-2 pr-4 text-right text-muted">{num(anchor, 2)}</td>
                    <td className="py-2 pr-4 text-right text-muted">{num(low, 2)} to {num(high, 2)}</td>
                    <td className="py-2 pr-4 text-right text-muted">{w.observations}</td>
                    <td className="py-2 text-muted">{w.updated_at ? formatDateTime(w.updated_at) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Label sources</h2>
        <p className="mt-1 max-w-measure text-meta text-muted">
          The last day against the week before. A source whose mean has moved more than 0.2 is left out of the next fit.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-meta">
            <thead>
              <tr className="border-b border-hairline text-left text-muted">
                <th className="py-2 pr-4 font-normal">Source</th>
                <th className="py-2 pr-4 text-right font-normal">Labels, 24h</th>
                <th className="py-2 pr-4 text-right font-normal">Mean, 24h</th>
                <th className="py-2 pr-4 text-right font-normal">Labels, prior 7d</th>
                <th className="py-2 pr-4 text-right font-normal">Mean, 7d</th>
                <th className="py-2 font-normal">State</th>
              </tr>
            </thead>
            <tbody>
              {(drift ?? []).map((d) => {
                const drifting = d.mean_24h != null && d.mean_7d != null && d.n_24h >= 10 && d.n_7d >= 20 && Math.abs(Number(d.mean_24h) - Number(d.mean_7d)) > 0.2;
                return (
                  <tr key={d.label_source} className="border-b border-hairline">
                    <td className="py-2 pr-4 text-ink">{SOURCE_LABELS[d.label_source] ?? d.label_source}</td>
                    <td className="py-2 pr-4 text-right text-ink">{d.n_24h}</td>
                    <td className="py-2 pr-4 text-right text-ink">{num(d.mean_24h, 3)}</td>
                    <td className="py-2 pr-4 text-right text-ink">{d.n_7d}</td>
                    <td className="py-2 pr-4 text-right text-ink">{num(d.mean_7d, 3)}</td>
                    <td className={drifting ? "py-2 text-signal" : "py-2 text-muted"}>{drifting ? "Drifting, excluded from the next fit" : "Steady"}</td>
                  </tr>
                );
              })}
              {!drift?.length ? (
                <tr><td colSpan={6} className="py-3 text-muted">No labels yet. They arrive as outlets follow stories and as reviewers work.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Model versions</h2>
        <p className="mt-1 max-w-measure text-meta text-muted">
          Every fit, promoted or not. Rolling back puts an earlier version&rsquo;s weights live, as a new version.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-meta">
            <thead>
              <tr className="border-b border-hairline text-left text-muted">
                <th className="py-2 pr-4 font-normal">Version</th>
                <th className="py-2 pr-4 font-normal">Kind</th>
                <th className="py-2 pr-4 font-normal">When</th>
                <th className="py-2 pr-4 text-right font-normal">Examples</th>
                <th className="py-2 pr-4 font-normal">Result</th>
                <th className="py-2 pr-4 font-normal">Note</th>
                <th className="py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {(versions ?? []).map((v) => {
                const m = (v.metrics as Record<string, unknown>) ?? {};
                const fitted = m.fitted as { auc?: number; precisionAtK?: number } | undefined;
                const live = m.live as { auc?: number; precisionAtK?: number } | undefined;
                const result = v.kind === "selection"
                  ? fitted
                    ? `AUC ${pct(fitted.auc)} vs live ${pct(live?.auc)}; top-30 precision ${pct(fitted.precisionAtK)} vs ${pct(live?.precisionAtK)}`
                    : String(m.status ?? "")
                  : m.auc != null
                    ? `AUC ${pct(m.auc as number)}${m.liveAuc != null ? ` vs live ${pct(m.liveAuc as number)}` : ""}`
                    : String(m.status ?? "");
                return (
                  <tr key={v.id} className="border-b border-hairline align-top">
                    <td className="py-2 pr-4 text-ink">{v.id}</td>
                    <td className="py-2 pr-4 text-ink">{v.kind}</td>
                    <td className="py-2 pr-4 text-muted">{formatDateTime(v.created_at)}</td>
                    <td className="py-2 pr-4 text-right text-ink">{v.examples ?? ""}</td>
                    <td className={v.promoted ? "py-2 pr-4 text-ink" : "py-2 pr-4 text-muted"}>{v.promoted ? "Promoted. " : ""}{result}</td>
                    <td className="py-2 pr-4 text-muted">{v.notes}</td>
                    <td className="py-2">
                      {v.kind === "selection" && !(promotedSelection && promotedSelection.id === v.id) ? (
                        <ActionButton action={rollbackWeights} hidden={{ version_id: String(v.id) }} label="Put these weights live" pendingLabel="Restoring…" />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!versions?.length ? (
                <tr><td colSpan={7} className="py-3 text-muted">No fits yet. The first runs tonight, or press &ldquo;Run the fit now&rdquo;.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {earlinessModel ? (
        <section className="mt-12 border-t border-hairline pt-6">
          <h2 className="text-section text-ink">What the earliness model has learned</h2>
          <p className="mt-1 max-w-measure text-meta text-muted">
            Standardised coefficients: how much each early signal raises the odds that a story reaches five outlets within six hours. Positive means more likely.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] max-w-xl border-collapse text-meta">
              <tbody>
                {[...EARLINESS_FEATURES]
                  .sort((a, b) => Math.abs(earlinessModel.coef[b]) - Math.abs(earlinessModel.coef[a]))
                  .map((name) => (
                    <tr key={name} className="border-b border-hairline">
                      <td className="py-2 pr-4 text-ink">{name.replace(/_/g, " ")}</td>
                      <td className="py-2 text-right text-ink">{num(earlinessModel.coef[name], 3)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Reviewers</h2>
        <p className="mt-1 max-w-measure text-meta text-muted">
          Leniency is a reviewer&rsquo;s mean importance against everyone&rsquo;s. Agreement is the share of their doubly-reviewed stories where the two verdicts were within one point.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-meta">
            <thead>
              <tr className="border-b border-hairline text-left text-muted">
                <th className="py-2 pr-4 font-normal">Reviewer</th>
                <th className="py-2 pr-4 text-right font-normal">Stories</th>
                <th className="py-2 pr-4 text-right font-normal">Missed verdicts</th>
                <th className="py-2 pr-4 text-right font-normal">Mean importance</th>
                <th className="py-2 pr-4 text-right font-normal">Mean quality</th>
                <th className="py-2 pr-4 text-right font-normal">Would not run</th>
                <th className="py-2 pr-4 text-right font-normal">Median seconds</th>
                <th className="py-2 pr-4 text-right font-normal">Leniency</th>
                <th className="py-2 text-right font-normal">Agreement</th>
              </tr>
            </thead>
            <tbody>
              {(reviewers ?? []).map((r) => (
                <tr key={r.reviewer_id} className="border-b border-hairline">
                  <td className="py-2 pr-4 text-ink">{r.email ?? r.reviewer_id}</td>
                  <td className="py-2 pr-4 text-right text-ink">{r.reviews}</td>
                  <td className="py-2 pr-4 text-right text-ink">{r.missed_reviews}</td>
                  <td className="py-2 pr-4 text-right text-ink">{num(r.avg_importance, 2)}</td>
                  <td className="py-2 pr-4 text-right text-ink">{num(r.avg_quality, 2)}</td>
                  <td className="py-2 pr-4 text-right text-ink">{pct(r.would_not_run_share, 1)}</td>
                  <td className="py-2 pr-4 text-right text-ink">{num(r.median_seconds)}</td>
                  <td className="py-2 pr-4 text-right text-ink">{r.leniency != null ? (Number(r.leniency) > 0 ? "+" : "") + num(r.leniency, 2) : ""}</td>
                  <td className="py-2 text-right text-ink">{r.agreement_pairs ? `${pct(r.agreement_share)} of ${r.agreement_pairs}` : ""}</td>
                </tr>
              ))}
              {!reviewers?.length ? (
                <tr><td colSpan={9} className="py-3 text-muted">No reviews yet. Give members the reviewer role on the People page; they review at /review.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}
