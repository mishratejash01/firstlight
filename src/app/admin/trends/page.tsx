import Link from "next/link";
import type { Metadata } from "next";

import { ActionButton } from "@/components/dashboard/action-button";
import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RunTrendsButton } from "@/components/dashboard/run-trends-button";
import { ExclusionForm } from "@/components/dashboard/exclusion-form";
import { requireEditorial } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatTimeAgo } from "@/lib/format/datetime";
import { removeExclusion, setTrendStatus } from "@/app/admin/trend-actions";

export const metadata: Metadata = {
  title: "Trending — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type NewsItem = { title: string; source: string; url: string };

/**
 * What the country is searching for, and what we are doing about it.
 *
 * Trends are shown with the coverage matched to them, because that coverage is
 * the only thing that makes a search term judgeable. "mirzapur movies" tells
 * you nothing; "mirzapur movies — NDTV: box office collection day 5" tells you
 * immediately that it is not news.
 */
export default async function AdminTrendsPage() {
  const user = await requireEditorial("/admin/trends");
  const supabase = await createClient();

  const [{ data: pending }, { data: newsworthy }, { data: rejected }, { data: exclusions }] =
    await Promise.all([
      supabase
        .from("trending_topics")
        .select("id, term, region, approx_traffic, news_items, triage_reason, last_seen_at, signal_score, corroboration, authority_score, demand_score, velocity")
        .eq("status", "pending")
        .order("signal_score", { ascending: false })
        .limit(30),
      supabase
        .from("trending_topics")
        .select("id, term, approx_traffic, triage_reason, triage_category, last_seen_at, signal_score, corroboration, authority_score, demand_score")
        .eq("status", "newsworthy")
        .order("signal_score", { ascending: false })
        .limit(20),
      supabase
        .from("trending_topics")
        .select("id, term, triage_reason, triage_category")
        .eq("status", "rejected")
        .order("last_seen_at", { ascending: false })
        .limit(15),
      supabase.from("trend_exclusions").select("id, pattern, reason").order("pattern"),
    ]);

  return (
    <DashboardShell
      user={user}
      title="Trending"
      standfirst="What people are searching for right now, and whether it is news."
      actions={<RunTrendsButton />}
    >
      <AdminNav current="/admin/trends" />

      <section className="pt-8">
        <p className="max-w-measure text-meta leading-relaxed text-muted">
          Polled from Google Trends across India, the US and the UK every 15
          minutes, then cross-referenced against Google News to find who is
          actually reporting each story. Candidates are scored on six signals —
          search volume, whether it is climbing, how many distinct outlets carry
          it, how authoritative those outlets are, whether our own readers
          searched for it and found nothing, and how fresh it is — minus a
          penalty for stories we have already covered. The highest score is
          written first. X/Twitter is not connected: its trends endpoint
          requires a paid API tier.
        </p>
      </section>

      <section className="mt-10 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Waiting for a decision ({pending?.length ?? 0})</h2>

        {pending?.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {pending.map((trend) => {
              const items = (trend.news_items as unknown as NewsItem[]) ?? [];
              return (
                <li key={trend.id} className="py-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-body text-ink">{trend.term}</p>
                    <span className="shrink-0 text-meta text-muted">
                      score {Number(trend.signal_score ?? 0).toFixed(1)} ·{" "}
                      {trend.approx_traffic} searches · {trend.region} ·{" "}
                      {formatTimeAgo(trend.last_seen_at)}
                    </span>
                  </div>

                  {/* The signals behind the score, so an editor can see why
                      something ranked where it did rather than trusting a
                      number. */}
                  <p className="mt-1 text-meta text-muted">
                    {trend.corroboration ?? 0} outlets · authority{" "}
                    {Number(trend.authority_score ?? 0).toFixed(2)}
                    {Number(trend.demand_score ?? 0) > 0
                      ? ` · ${trend.demand_score} reader searches`
                      : ""}
                    {trend.velocity === null || trend.velocity === undefined
                      ? " · first sighting"
                      : ` · ${(Number(trend.velocity) * 100).toFixed(0)}% of last reading`}
                  </p>

                  {items.length ? (
                    <ul className="mt-2 space-y-1">
                      {items.slice(0, 3).map((item, index) => (
                        <li key={index} className="text-meta text-muted">
                          <span className="text-ink">{item.source}</span>:{" "}
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="hover:text-accent"
                          >
                            {item.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-meta text-muted">
                      No coverage matched — nothing to write from.
                    </p>
                  )}

                  {trend.triage_reason ? (
                    <p className="mt-2 text-meta text-muted">{trend.triage_reason}</p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton
                      action={setTrendStatus}
                      hidden={{ trend_id: trend.id, status: "newsworthy" }}
                      label="This is news"
                      pendingLabel="Marking…"
                      variant="primary"
                    />
                    <ActionButton
                      action={setTrendStatus}
                      hidden={{ trend_id: trend.id, status: "rejected" }}
                      label="Not news"
                      pendingLabel="Rejecting…"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="Nothing waiting."
            detail="Either no trends have been polled yet, or every one has been triaged. Press 'Check trends now' above to poll immediately."
          />
        )}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">
          Queued to write about ({newsworthy?.length ?? 0})
        </h2>
        {newsworthy?.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {newsworthy.map((trend) => (
              <li key={trend.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-body text-ink">{trend.term}</p>
                  <p className="text-meta text-muted">
                    score {Number(trend.signal_score ?? 0).toFixed(1)} ·{" "}
                    {trend.corroboration ?? 0} outlets · authority{" "}
                    {Number(trend.authority_score ?? 0).toFixed(2)} ·{" "}
                    {trend.approx_traffic} searches
                  </p>
                  {trend.triage_reason ? (
                    <p className="text-meta text-muted">{trend.triage_reason}</p>
                  ) : null}
                </div>
                <ActionButton
                  action={setTrendStatus}
                  hidden={{ trend_id: trend.id, status: "rejected" }}
                  label="Drop"
                  pendingLabel="Dropping…"
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nothing queued."
            detail="Trends marked as news appear here and are written up on the next run, if automatic writing is switched on."
          />
        )}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Recently rejected</h2>
        {rejected?.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {rejected.map((trend) => (
              <li key={trend.id} className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-meta text-ink">{trend.term}</p>
                  <p className="text-meta text-muted">
                    {trend.triage_category ? `${trend.triage_category} — ` : ""}
                    {trend.triage_reason}
                  </p>
                </div>
                <ActionButton
                  action={setTrendStatus}
                  hidden={{ trend_id: trend.id, status: "newsworthy" }}
                  label="Actually, cover it"
                  pendingLabel="Restoring…"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-meta text-muted">Nothing rejected yet.</p>
        )}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Never cover these</h2>
        <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
          Any trend containing one of these is rejected before it reaches
          triage. Matching is a plain substring, so keep patterns specific —
          &ldquo;bet&rdquo; would catch &ldquo;Tibet&rdquo;.
        </p>

        <ul className="mt-4 flex flex-wrap gap-2">
          {(exclusions ?? []).map((exclusion) => (
            <li key={exclusion.id} className="flex items-center gap-2 border border-hairline px-3 py-1.5">
              <span className="text-meta text-ink">{exclusion.pattern}</span>
              <ActionButton
                action={removeExclusion}
                hidden={{ exclusion_id: exclusion.id }}
                label="×"
                pendingLabel="…"
              />
            </li>
          ))}
        </ul>

        <ExclusionForm />
      </section>

      <p className="mt-10 border-t border-hairline pt-6 max-w-measure text-meta leading-relaxed text-muted">
        Whether queued trends are written automatically, and whether those
        articles publish or wait as drafts, is set on{" "}
        <Link href="/admin/topics" className="text-accent underline underline-offset-4">
          AI topics
        </Link>
        .
      </p>
    </DashboardShell>
  );
}
