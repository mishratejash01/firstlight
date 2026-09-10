import Link from "next/link";
import type { Metadata } from "next";

import { ActionButton } from "@/components/dashboard/action-button";
import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RunEngineButton } from "@/components/dashboard/run-engine-button";
import { requireEditorial } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatTimeAgo } from "@/lib/format/datetime";
import { setEventStatus } from "@/app/admin/event-actions";

export const metadata: Metadata = {
  title: "Events — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * What the engine is watching, and what it has decided.
 *
 * Every number on this page is one the engine actually used. The feature
 * readout under each event is there so an editor can see why something ranks
 * where it does — and overrule it, which is how the weights learn.
 */

const FEATURE_LABELS: { key: string; label: string }[] = [
  { key: "burst", label: "burst" },
  { key: "surprise", label: "surprise" },
  { key: "corroboration", label: "corroboration" },
  { key: "lead_authority", label: "authority" },
  { key: "acceleration", label: "accelerating" },
  { key: "magnitude", label: "magnitude" },
  { key: "relevance", label: "relevance" },
  { key: "novelty", label: "novelty" },
];

type EventRow = {
  id: string;
  title: string;
  status: string;
  score: number | null;
  mention_count: number;
  source_count: number;
  independent_sources: number | null;
  first_seen_at: string;
  last_seen_at: string;
  burst: number | null;
  surprise: number | null;
  corroboration: number | null;
  lead_authority: number | null;
  acceleration: number | null;
  magnitude: number | null;
  relevance: number | null;
  novelty: number | null;
  triage_reason: string | null;
  triage_angle: string | null;
  urgency: string | null;
  severity: string | null;
  last_error: string | null;
  write_attempts: number;
  entities: string[] | null;
};

function Signals({ event }: { event: EventRow }) {
  return (
    <p className="mt-1 text-meta text-muted">
      {FEATURE_LABELS.map(({ key, label }, index) => {
        const value = Number((event as unknown as Record<string, unknown>)[key] ?? 0);
        return (
          <span key={key}>
            {index ? " · " : ""}
            {label} {value.toFixed(1)}
          </span>
        );
      })}
    </p>
  );
}

function Provenance({ event }: { event: EventRow }) {
  return (
    <span className="shrink-0 text-meta text-muted">
      score {Number(event.score ?? 0).toFixed(1)} · {event.mention_count} mentions ·{" "}
      {Number(event.independent_sources ?? 0).toFixed(1)} independent of {event.source_count}{" "}
      · first seen {formatTimeAgo(event.first_seen_at)}
    </span>
  );
}

export default async function AdminEventsPage() {
  const user = await requireEditorial("/admin/events");
  const supabase = await createClient();

  const columns =
    "id, title, status, score, mention_count, source_count, independent_sources, first_seen_at, last_seen_at, burst, surprise, corroboration, lead_authority, acceleration, magnitude, relevance, novelty, triage_reason, triage_angle, urgency, severity, last_error, write_attempts, entities";

  const [{ data: desk }, { data: rising }, { data: written }, { data: rejected }, { data: weights }] =
    await Promise.all([
      supabase
        .from("story_events")
        .select(columns)
        .in("status", ["newsworthy", "writing"])
        .order("score", { ascending: false })
        .limit(20),
      supabase
        .from("story_events")
        .select(columns)
        .eq("status", "candidate")
        .gte("last_seen_at", new Date(Date.now() - 24 * 3600_000).toISOString())
        .order("score", { ascending: false })
        .limit(25),
      supabase
        .from("story_events")
        .select(`${columns}, articles ( slug, headline, status, categories ( slug ) )`)
        .eq("status", "written")
        .order("updated_at", { ascending: false })
        .limit(10),
      supabase
        .from("story_events")
        .select(columns)
        .eq("status", "rejected")
        .not("triage_reason", "is", null)
        .order("updated_at", { ascending: false })
        .limit(12),
      supabase
        .from("signal_weights")
        .select("feature, mean, variance, observations")
        .order("feature"),
    ]);

  const deskRows = (desk ?? []) as EventRow[];
  const risingRows = (rising ?? []) as EventRow[];
  const rejectedRows = (rejected ?? []) as EventRow[];

  return (
    <DashboardShell
      user={user}
      title="Events"
      standfirst="What is breaking across the streams the engine watches, and what it has decided to do about it."
      actions={<RunEngineButton />}
    >
      <AdminNav current="/admin/events" />

      <section className="pt-8">
        <p className="max-w-measure text-meta leading-relaxed text-muted">
          Every minute the engine reads Bluesky, Hacker News, Wikipedia edit
          bursts, the USGS feed and the wire; every fifteen it adds Google
          Trends, Google News, Wikipedia pageviews, Mastodon and prediction
          markets. Mentions are clustered into events by meaning, then scored
          on how sharply attention rose against each subject&apos;s own
          history, how many independent outlets carry it, who reported it
          first, whether it is still climbing, and how far it is from anything
          already published. Events above the threshold are triaged by the
          model with all of that laid out; the ones that pass are verified
          against the source text and written. Your decisions here become
          training labels.
        </p>
      </section>

      <section className="mt-10 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">On the desk ({deskRows.length})</h2>
        {deskRows.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {deskRows.map((event) => (
              <li key={event.id} className="py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-body text-ink">
                    {event.title}
                    {event.urgency === "breaking" ? (
                      <span className="ml-2 text-meta text-signal">breaking</span>
                    ) : null}
                    {event.status === "writing" ? (
                      <span className="ml-2 text-meta text-muted">writing now</span>
                    ) : null}
                  </p>
                  <Provenance event={event} />
                </div>
                <Signals event={event} />
                {event.triage_angle ? (
                  <p className="mt-2 text-meta text-ink">{event.triage_angle}</p>
                ) : null}
                {event.triage_reason ? (
                  <p className="mt-1 text-meta text-muted">{event.triage_reason}</p>
                ) : null}
                {event.last_error ? (
                  <p className="mt-1 text-meta text-muted">
                    Attempt {event.write_attempts}: {event.last_error}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton
                    action={setEventStatus}
                    hidden={{ event_id: event.id, status: "rejected" }}
                    label="Drop"
                    pendingLabel="Dropping…"
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nothing on the desk."
            detail="Events that pass triage wait here until they are verified and written. Press 'Run the engine now' to poll, score and triage immediately."
          />
        )}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Rising ({risingRows.length})</h2>
        <p className="mt-1 max-w-measure text-meta text-muted">
          The strongest candidates in the last day, highest score first. Marking
          one as news sends it straight to the desk.
        </p>
        {risingRows.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {risingRows.map((event) => (
              <li key={event.id} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-body text-ink">{event.title}</p>
                  <Provenance event={event} />
                </div>
                <Signals event={event} />
                {event.entities?.length ? (
                  <p className="mt-1 text-meta text-muted">
                    {event.entities.slice(0, 6).join(" · ")}
                  </p>
                ) : null}
                {event.last_error ? (
                  <p className="mt-1 text-meta text-muted">{event.last_error}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton
                    action={setEventStatus}
                    hidden={{ event_id: event.id, status: "newsworthy" }}
                    label="This is news"
                    pendingLabel="Marking…"
                    variant="primary"
                  />
                  <ActionButton
                    action={setEventStatus}
                    hidden={{ event_id: event.id, status: "rejected" }}
                    label="Not news"
                    pendingLabel="Rejecting…"
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nothing rising."
            detail="No events have been clustered in the last day. Either the schedule has not run yet, or every stream came back empty."
          />
        )}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Written ({written?.length ?? 0})</h2>
        {written?.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {written.map((event) => {
              const article = event.articles as unknown as {
                slug: string;
                headline: string;
                status: string;
                categories: { slug: string } | null;
              } | null;
              return (
                <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                  <div className="min-w-0">
                    {article ? (
                      <Link
                        href={
                          article.categories
                            ? `/${article.categories.slug}/${article.slug}`
                            : `/admin/events`
                        }
                        className="text-body text-ink hover:text-accent"
                      >
                        {article.headline}
                      </Link>
                    ) : (
                      <p className="text-body text-ink">{event.title}</p>
                    )}
                    <p className="text-meta text-muted">
                      {article?.status ?? "unknown"} · severity {event.severity ?? "unrated"} ·{" "}
                      {Number(event.independent_sources ?? 0).toFixed(1)} independent sources ·{" "}
                      {formatTimeAgo(event.last_seen_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="Nothing written yet."
            detail="Events that pass verification are written here, as scheduled articles if autonomous publishing is on and as drafts if it is not."
          />
        )}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Rejected or held ({rejectedRows.length})</h2>
        {rejectedRows.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {rejectedRows.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-body text-ink">{event.title}</p>
                  <p className="text-meta text-muted">{event.triage_reason}</p>
                </div>
                <ActionButton
                  action={setEventStatus}
                  hidden={{ event_id: event.id, status: "newsworthy" }}
                  label="Actually, this is news"
                  pendingLabel="Marking…"
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing rejected." detail="Triage has not turned anything down yet." />
        )}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">What the engine has learned</h2>
        <p className="mt-1 max-w-measure text-meta text-muted">
          The weight on each signal, and how sure the engine is of it. Weights
          move as editors, readers and other outlets confirm or contradict its
          choices; the variance shrinks as evidence accumulates.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full max-w-xl text-left text-meta">
            <thead>
              <tr className="border-b border-hairline text-muted">
                <th className="py-2 pr-4 font-normal">Signal</th>
                <th className="py-2 pr-4 font-normal">Weight</th>
                <th className="py-2 pr-4 font-normal">Uncertainty</th>
                <th className="py-2 font-normal">Labels</th>
              </tr>
            </thead>
            <tbody>
              {(weights ?? []).map((w) => (
                <tr key={w.feature} className="border-b border-hairline">
                  <td className="py-2 pr-4 text-ink">{w.feature.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-4 text-ink">{Number(w.mean).toFixed(2)}</td>
                  <td className="py-2 pr-4 text-muted">±{Math.sqrt(Number(w.variance)).toFixed(2)}</td>
                  <td className="py-2 text-muted">{w.observations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}
