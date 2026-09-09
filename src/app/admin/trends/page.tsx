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
        .select("id, term, region, approx_traffic, news_items, triage_reason, last_seen_at")
        .eq("status", "pending")
        .order("traffic_rank", { ascending: false, nullsFirst: false })
        .limit(30),
      supabase
        .from("trending_topics")
        .select("id, term, approx_traffic, triage_reason, triage_category, last_seen_at")
        .eq("status", "newsworthy")
        .order("traffic_rank", { ascending: false, nullsFirst: false })
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
          Polled from Google Trends every 15 minutes. Terms matching the
          exclusion list are rejected on sight; the rest are judged against the
          coverage attached to them. X/Twitter is not connected — its trends
          endpoint requires a paid API tier.
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
                      {trend.approx_traffic} searches · {trend.region} ·{" "}
                      {formatTimeAgo(trend.last_seen_at)}
                    </span>
                  </div>

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
                    {trend.approx_traffic} searches
                    {trend.triage_reason ? ` · ${trend.triage_reason}` : ""}
                  </p>
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
