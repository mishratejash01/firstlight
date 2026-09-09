import type { Metadata } from "next";

import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatTable } from "@/components/dashboard/stat-table";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format/datetime";

export const metadata: Metadata = {
  title: "Audience — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Audience figures.
 *
 * Every panel that can be empty explains why it is empty and what would fill
 * it. A blank retention table with no explanation is indistinguishable from a
 * broken one, and an administrator who cannot tell the difference stops
 * trusting the whole dashboard.
 */
export default async function AdminAudiencePage() {
  const user = await requireAdmin("/admin/audience");
  const supabase = await createClient();

  const [retention, follows, subscribers] = await Promise.all([
    supabase.rpc("dashboard_retention", { p_days: 30 }),
    supabase.rpc("dashboard_follow_counts", { p_limit: 15 }),
    supabase.from("newsletter_subscribers").select("status, created_at"),
  ]);

  const subscriberCounts = (subscribers.data ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const retentionRows = retention.data ?? [];
  const followRows = follows.data ?? [];

  return (
    <DashboardShell
      user={user}
      title="Audience"
      standfirst="Who is reading, who is coming back, and who has subscribed."
    >
      <AdminNav current="/admin/audience" />

      <section className="pt-8">
        <h2 className="text-section text-ink">Newsletter</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          {[
            { label: "Confirmed", value: subscriberCounts.confirmed ?? 0, hint: "Opted in and receiving" },
            { label: "Awaiting confirmation", value: subscriberCounts.pending ?? 0, hint: "Signed up, not yet confirmed" },
            { label: "Unsubscribed", value: subscriberCounts.unsubscribed ?? 0, hint: "Opted out" },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="text-meta text-muted">{stat.label}</dt>
              <dd className="mt-0.5 text-[1.6rem] tabular-nums text-ink">
                {stat.value}
              </dd>
              <dd className="text-meta text-muted">{stat.hint}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-measure text-meta leading-relaxed text-muted">
          Signups are stored but nothing is sent yet — no email provider is
          connected. Confirmation emails will begin once one is.
        </p>
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Are readers coming back?</h2>
        <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
          Each row is everyone first seen on that day, and how many returned 1, 7
          and 30 days later. Readers who declined tracking are counted on the day
          they arrive but cannot be recognised on a later visit, so these figures
          understate returns — that is the cost of not fingerprinting people.
        </p>

        {retentionRows.length ? (
          <StatTable
            columns={[
              { key: "day", label: "First seen" },
              { key: "size", label: "Readers", numeric: true },
              { key: "d1", label: "Back next day", numeric: true },
              { key: "d7", label: "Back after a week", numeric: true },
              { key: "d30", label: "Back after a month", numeric: true },
            ]}
            rows={retentionRows.map((row) => ({
              day: formatDate(row.cohort_day),
              size: row.cohort_size,
              d1: row.returned_d1,
              d7: row.returned_d7,
              d30: row.returned_d30,
            }))}
            empty=""
          />
        ) : (
          <EmptyState
            title="No cohorts yet."
            detail="This fills once the site has had visitors across more than one day. Nothing is wrong — there is simply no second day to compare against yet."
          />
        )}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Most followed</h2>
        <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
          Topics and writers readers have chosen to follow. A strong following is
          a signal worth commissioning against.
        </p>

        {followRows.length ? (
          <StatTable
            columns={[
              { key: "name", label: "Topic or writer" },
              { key: "type", label: "Type" },
              { key: "followers", label: "Followers", numeric: true },
            ]}
            rows={followRows.map((row) => ({
              name: row.target_name,
              type: row.target_type,
              followers: row.followers,
            }))}
            empty=""
          />
        ) : (
          <EmptyState
            title="Nobody is following anything yet."
            detail="Readers can follow a topic or a writer from any topic or author page, but they have to be signed in to do it. This fills as soon as one does."
          />
        )}
      </section>

      <p className="mt-12 border-t border-hairline pt-6 text-meta leading-relaxed text-muted">
        These figures come from scheduled summaries rather than live counting —
        trending refreshes every five minutes, everything else hourly — so they
        can lag current traffic by that much. Page generated{" "}
        {formatDateTime(new Date().toISOString())}.
      </p>
    </DashboardShell>
  );
}
