import type { Metadata } from "next";

import { ActionButton } from "@/components/dashboard/action-button";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { StatTable } from "@/components/dashboard/stat-table";
import { GrantRoleForm } from "@/components/dashboard/grant-role-form";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format/datetime";
import {
  listAccounts,
  revokeRole,
  setCategoryVisibility,
} from "@/app/admin/actions";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Administration.
 *
 * Accounts and roles, site configuration, and the figures that describe the
 * business rather than the copy. Retention is admin-only for that reason —
 * the database function refuses it to editors regardless of what this page
 * chooses to render.
 */
export default async function AdminPage() {
  const user = await requireAdmin("/admin");
  const supabase = await createClient();

  const [accounts, roleRows, categories, retention, follows, subscribers, articleStats] =
    await Promise.all([
      listAccounts(),
      supabase.from("user_roles").select("id, user_id, role, created_at"),
      supabase
        .from("categories")
        .select("id, slug, name, show_in_nav, is_active")
        .order("sort_order", { ascending: true }),
      supabase.rpc("dashboard_retention", { p_days: 30 }),
      supabase.rpc("dashboard_follow_counts", { p_limit: 10 }),
      supabase
        .from("newsletter_subscribers")
        .select("status", { count: "exact", head: false }),
      supabase.from("articles").select("status"),
    ]);

  const rolesByUser = new Map<string, { id: string; role: string }[]>();
  for (const row of roleRows.data ?? []) {
    const existing = rolesByUser.get(row.user_id) ?? [];
    existing.push({ id: row.id, role: row.role });
    rolesByUser.set(row.user_id, existing);
  }

  const countBy = <T extends { status: string }>(rows: T[] | null) =>
    (rows ?? []).reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});

  const articleCounts = countBy(articleStats.data);
  const subscriberCounts = countBy(subscribers.data);

  return (
    <DashboardShell
      user={user}
      title="Administration"
      standfirst="Accounts, site configuration and the numbers behind the newsroom."
    >
      {/* ---------------------------------------------------------------- */}
      <section>
        <h2 className="font-serif text-section text-ink">At a glance</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          {[
            { label: "Published", value: articleCounts.published ?? 0 },
            { label: "In review", value: articleCounts.in_review ?? 0 },
            { label: "Drafts", value: articleCounts.draft ?? 0 },
            { label: "Scheduled", value: articleCounts.scheduled ?? 0 },
            { label: "Accounts", value: accounts.length },
            { label: "Confirmed subscribers", value: subscriberCounts.confirmed ?? 0 },
            { label: "Awaiting confirmation", value: subscriberCounts.pending ?? 0 },
            { label: "Sections in nav", value: (categories.data ?? []).filter((c) => c.show_in_nav).length },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="text-meta text-muted">{stat.label}</dt>
              <dd className="mt-0.5 font-serif text-[1.6rem] tabular-nums text-ink">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="font-serif text-section text-ink">Accounts and roles</h2>
        <p className="mt-1 text-meta text-muted">
          Signing in creates a reader account and nothing more. Editorial access
          exists only where it is granted here.
        </p>

        <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
          {accounts.map((account) => {
            const roles = rolesByUser.get(account.id) ?? [];
            return (
              <li key={account.id} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-body text-ink">{account.email ?? account.id}</p>
                  <p className="text-meta text-muted">
                    joined {formatDate(account.createdAt)}
                    {account.lastSignInAt
                      ? ` · last seen ${formatDate(account.lastSignInAt)}`
                      : null}
                  </p>
                </div>

                <div className="mt-2 flex flex-wrap items-start gap-2">
                  {roles.length ? (
                    roles.map((role) => (
                      <span key={role.id} className="inline-flex items-center gap-2">
                        <span className="rounded-control border border-hairline px-2.5 py-1 text-meta text-ink capitalize">
                          {role.role}
                        </span>
                        <ActionButton
                          action={revokeRole}
                          hidden={{ role_id: role.id, user_id: account.id, role: role.role }}
                          label="Revoke"
                          pendingLabel="Revoking…"
                        />
                      </span>
                    ))
                  ) : (
                    <span className="text-meta text-muted">Reader</span>
                  )}
                </div>

                <div className="mt-3">
                  <GrantRoleForm userId={account.id} existing={roles.map((r) => r.role)} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="font-serif text-section text-ink">Navigation</h2>
        <p className="mt-1 text-meta text-muted">
          The header renders exactly what is switched on here. Sections kept out
          of navigation stay addressable, so wire content still has somewhere to
          land.
        </p>

        <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
          {categories.data?.map((category) => (
            <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-body text-ink">{category.name}</p>
                <p className="text-meta text-muted">
                  /{category.slug}
                  {category.show_in_nav ? " · in navigation" : " · hidden from navigation"}
                </p>
              </div>
              <ActionButton
                action={setCategoryVisibility}
                hidden={{
                  category_id: category.id,
                  show_in_nav: category.show_in_nav ? "false" : "true",
                }}
                label={category.show_in_nav ? "Remove from nav" : "Add to nav"}
                pendingLabel="Updating…"
              />
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="font-serif text-section text-ink">Reader retention</h2>
        <p className="mt-1 text-meta text-muted">
          Cohorts by first visit. Anonymous readers are counted by a rotating
          identifier, so returning-reader figures are an undercount — the honest
          cost of not fingerprinting people.
        </p>
        <StatTable
          columns={[
            { key: "day", label: "First seen" },
            { key: "size", label: "Readers", numeric: true },
            { key: "d1", label: "Day 1", numeric: true },
            { key: "d7", label: "Day 7", numeric: true },
            { key: "d30", label: "Day 30", numeric: true },
          ]}
          rows={(retention.data ?? []).map((row) => ({
            day: formatDate(row.cohort_day),
            size: row.cohort_size,
            d1: row.returned_d1,
            d7: row.returned_d7,
            d30: row.returned_d30,
          }))}
          empty="Not enough history yet — cohorts appear once the site has visitors across multiple days."
        />
      </section>

      <section className="mt-10 border-t border-hairline pt-6">
        <h2 className="font-serif text-section text-ink">Most followed</h2>
        <StatTable
          columns={[
            { key: "name", label: "Topic or writer" },
            { key: "type", label: "Type" },
            { key: "followers", label: "Followers", numeric: true },
          ]}
          rows={(follows.data ?? []).map((row) => ({
            name: row.target_name,
            type: row.target_type,
            followers: row.followers,
          }))}
          empty="Nobody is following anything yet."
        />
      </section>

      <p className="mt-10 text-meta text-muted">
        Analytics rollups refresh on a schedule — trending every five minutes,
        everything else hourly. Figures here can lag live traffic by that much.
        Generated {formatDateTime(new Date().toISOString())}.
      </p>
    </DashboardShell>
  );
}
