import Link from "next/link";
import type { Metadata } from "next";

import { ActionButton } from "@/components/dashboard/action-button";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { StatTable } from "@/components/dashboard/stat-table";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { UnverifiedClaims } from "@/components/dashboard/unverified-claims";
import { ScheduleForm } from "@/components/dashboard/schedule-form";
import { requireEditorial } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatTimeAgo } from "@/lib/format/datetime";
import {
  archiveArticle,
  pinToHomepage,
  publishArticle,
  sendBackToAuthor,
  unpinFromHomepage,
} from "@/app/desk/actions";

export const metadata: Metadata = {
  title: "Desk",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The editor desk.
 *
 * One queue for everything. Original copy, licensed wire content and curated
 * summaries all land here and are published by the same person pressing the
 * same button — there is no fast path that skips a human, by design.
 *
 * The analytics panels below read the scheduled rollups through role-checked
 * database functions. Nothing on this page aggregates raw event rows live.
 */
export default async function DeskPage() {
  const user = await requireEditorial("/desk");
  const supabase = await createClient();

  const [queue, published, placements, trending, underperforming, referrers, gaps] =
    await Promise.all([
      supabase
        .from("articles")
        .select("id, headline, status, origin, updated_at, summary, ai_assisted, ai_unverified_claims, categories ( slug, name ), authors ( display_name )")
        .in("status", ["in_review", "draft", "rejected"])
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("articles")
        .select("id, slug, headline, status, published_at, categories ( slug, name )")
        .in("status", ["published", "scheduled"])
        .order("published_at", { ascending: false })
        .limit(15),
      supabase
        .from("homepage_placements")
        .select("id, zone, position, expires_at, articles ( headline )")
        .order("zone", { ascending: true }),
      supabase.rpc("dashboard_trending", { p_limit: 8 }),
      supabase.rpc("dashboard_content_performance", { p_days: 7, p_order: "under", p_limit: 8 }),
      supabase.rpc("dashboard_referral_sources", { p_days: 30, p_limit: 8 }),
      supabase.rpc("dashboard_search_gaps", { p_limit: 8 }),
    ]);

  return (
    <DashboardShell
      user={user}
      title="Desk"
      standfirst="Everything awaiting a decision, and how published work is performing."
      actions={
        <Link href="/desk/wire" className="text-meta text-accent underline underline-offset-4">
          Wire queue
        </Link>
      }
    >
      {/* ---------------------------------------------------------------- */}
      <section>
        <h2 className="text-section text-ink">Review queue</h2>
        <p className="mt-1 text-meta text-muted">
          Wire, original and curated copy all arrive here. Nothing publishes
          without a decision on this page.
        </p>

        {queue.data?.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {queue.data.map((article) => (
              <li key={article.id} className="py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-[1.1rem] leading-snug text-ink">
                    {article.headline}
                  </h3>
                  <StatusBadge status={article.status} />
                </div>

                <p className="mt-1 text-meta text-muted">
                  {article.categories?.name}
                  {article.authors ? ` · ${article.authors.display_name}` : null}
                  {` · ${article.origin} · updated ${formatTimeAgo(article.updated_at)}`}
                </p>

                {article.summary ? (
                  <p className="mt-2 max-w-measure text-meta leading-relaxed text-muted">
                    {article.summary}
                  </p>
                ) : null}

                {article.ai_assisted ? (
                  <div className="mt-3">
                    <UnverifiedClaims claims={article.ai_unverified_claims ?? []} />
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-start gap-3">
                  <ActionButton
                    action={publishArticle}
                    hidden={{ id: article.id }}
                    label="Publish now"
                    pendingLabel="Publishing…"
                    variant="primary"
                  />
                  <ScheduleForm articleId={article.id} />
                  <ActionButton
                    action={sendBackToAuthor}
                    hidden={{ id: article.id }}
                    label="Send back"
                    pendingLabel="Sending…"
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-body text-muted">The queue is empty.</p>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Front page</h2>
        <p className="mt-1 text-meta text-muted">
          A pin overrides the ranking for one slot. Every pin expires, so a
          forgotten splash cannot sit there all night.
        </p>

        {placements.data?.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {placements.data.map((placement) => (
              <li key={placement.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                <div>
                  <p className="text-body text-ink">{placement.articles?.headline}</p>
                  <p className="text-meta text-muted capitalize">
                    {placement.zone} slot {placement.position}
                    {placement.expires_at
                      ? ` · expires ${formatDateTime(placement.expires_at)}`
                      : " · no expiry"}
                  </p>
                </div>
                <ActionButton
                  action={unpinFromHomepage}
                  hidden={{ placement_id: placement.id }}
                  label="Unpin"
                  pendingLabel="Removing…"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-body text-muted">
            No pins live. The front page is ranking itself.
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Recently published</h2>
        <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
          {published.data?.map((article) => (
            <li key={article.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
              <div className="min-w-0">
                <Link
                  href={`/${article.categories?.slug}/${article.slug}`}
                  className="text-body text-ink hover:text-accent"
                >
                  {article.headline}
                </Link>
                <p className="text-meta text-muted">
                  {article.published_at ? formatDateTime(article.published_at) : null}
                  {article.status === "scheduled" ? " · scheduled" : null}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  action={pinToHomepage}
                  hidden={{ article_id: article.id, zone: "hero", hours: "12" }}
                  label="Pin as splash"
                  pendingLabel="Pinning…"
                />
                <ActionButton
                  action={archiveArticle}
                  hidden={{ id: article.id }}
                  label="Archive"
                  pendingLabel="Archiving…"
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Trending right now</h2>
        <p className="mt-1 text-meta text-muted">
          Views weighted by recency, refreshed every five minutes. The same
          signal the recommendation engine reads.
        </p>
        <StatTable
          columns={[
            { key: "headline", label: "Article" },
            { key: "views_1h", label: "Last hour", numeric: true },
            { key: "views_24h", label: "24 hours", numeric: true },
          ]}
          rows={(trending.data ?? []).map((row) => ({
            headline: row.headline,
            views_1h: row.views_1h,
            views_24h: row.views_24h,
          }))}
          empty="No traffic recorded in the last 48 hours."
        />
      </section>

      <section className="mt-10 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Underperforming this week</h2>
        <p className="mt-1 text-meta text-muted">
          Published work readers are not finishing. Drop-off is the point at
          which fewer than half of those who started are still reading — usually
          a slow top or a headline the piece does not deliver on.
        </p>
        <StatTable
          columns={[
            { key: "headline", label: "Article" },
            { key: "sessions", label: "Readers", numeric: true },
            { key: "completion", label: "Finished", numeric: true },
            { key: "dropoff", label: "Drop-off", numeric: true },
          ]}
          rows={(underperforming.data ?? []).map((row) => ({
            headline: row.headline,
            sessions: row.sessions,
            completion: row.completion_rate_pct === null ? "—" : `${row.completion_rate_pct}%`,
            dropoff: row.median_drop_off_pct ? `${row.median_drop_off_pct}%` : "—",
          }))}
          empty="Not enough reading data yet."
        />
      </section>

      <section className="mt-10 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Top entry points</h2>
        <p className="mt-1 text-meta text-muted">
          Views count every arrival. Identified readers counts only those who
          agreed to tracking, so it is always the smaller number — the rest are
          recorded without any identifier at all.
        </p>
        <StatTable
          columns={[
            { key: "source", label: "Source" },
            { key: "events", label: "Views", numeric: true },
            { key: "actors", label: "Identified readers", numeric: true },
          ]}
          rows={(referrers.data ?? []).map((row) => ({
            source: row.source,
            actors: row.actors,
            events: row.events,
          }))}
          empty="No referral data yet."
        />
      </section>

      <section className="mt-10 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">What readers searched for</h2>
        <p className="mt-1 text-meta text-muted">
          Ordered by unmet demand. A query returning nothing is a commissioning
          brief.
        </p>
        <StatTable
          columns={[
            { key: "query", label: "Query" },
            { key: "searches", label: "Searches", numeric: true },
            { key: "zero", label: "No results", numeric: true },
          ]}
          rows={(gaps.data ?? []).map((row) => ({
            query: row.query,
            searches: row.searches,
            zero: row.zero_result_searches,
          }))}
          empty="No site searches recorded yet."
        />
      </section>
    </DashboardShell>
  );
}
