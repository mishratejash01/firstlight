import Link from "next/link";
import type { Metadata } from "next";

import { AdminNav } from "@/components/dashboard/admin-nav";
import { AttentionCard } from "@/components/dashboard/attention-card";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AiKeyHealth } from "@/components/dashboard/ai-key-health";
import { IntegrationStatus } from "@/components/dashboard/integration-status";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { listAccounts } from "@/app/admin/actions";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Administration overview.
 *
 * Answers one question: is there anything I need to do? Items with a count of
 * zero are not shown, so an empty "Needs attention" section genuinely means
 * nothing is waiting — rather than a wall of zeroes an administrator has to
 * read past every time.
 *
 * The reference numbers underneath are separate and explicitly labelled as
 * "nothing to do here", because mixing status figures with action items is what
 * made the previous version unreadable.
 */
export default async function AdminOverviewPage() {
  const user = await requireAdmin("/admin");
  const supabase = await createClient();

  const [accountResult, roleRows, articles, subscribers, categories] = await Promise.all([
    listAccounts(),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("articles").select("status"),
    supabase.from("newsletter_subscribers").select("status"),
    supabase.from("categories").select("show_in_nav, is_active"),
  ]);

  const accounts = accountResult.ok ? accountResult.accounts : [];
  const accountsUnavailable = !accountResult.ok;

  const usersWithRoles = new Set((roleRows.data ?? []).map((r) => r.user_id));
  const readersOnly = accounts.filter((a) => !usersWithRoles.has(a.id));

  const byStatus = (rows: { status: string }[] | null) =>
    (rows ?? []).reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});

  const articleCounts = byStatus(articles.data);
  const subscriberCounts = byStatus(subscribers.data);

  const attention = [
    {
      count: articleCounts.in_review ?? 0,
      title: articleCounts.in_review === 1 ? "story waiting for a decision" : "stories waiting for a decision",
      detail:
        "Contributors have submitted these and cannot publish them themselves. Nothing goes live until an editor decides.",
      href: "/desk",
      actionLabel: "Open the desk",
    },
    {
      count: readersOnly.length,
      title: readersOnly.length === 1 ? "account with no access" : "accounts with no access",
      detail:
        "Signing in creates a reader account and nothing more. If any of these people are staff, they need a role before they can file or publish.",
      href: "/admin/people",
      actionLabel: "Review people",
    },
    {
      count: articleCounts.rejected ?? 0,
      title: "sent back to their authors",
      detail:
        "These were returned for changes. They reappear on the desk once the writer resubmits.",
      href: "/desk",
      actionLabel: "Open the desk",
    },
  ].filter((item) => item.count > 0);

  const reference: { label: string; value: number | string }[] = [
    { label: "Published articles", value: articleCounts.published ?? 0 },
    { label: "Scheduled to publish", value: articleCounts.scheduled ?? 0 },
    { label: "Drafts in progress", value: articleCounts.draft ?? 0 },
    { label: "Accounts in total", value: accountsUnavailable ? "—" : accounts.length },
    { label: "Confirmed subscribers", value: subscriberCounts.confirmed ?? 0 },
    {
      label: "Sections in the menu",
      value: (categories.data ?? []).filter((c) => c.show_in_nav && c.is_active).length,
    },
  ];

  return (
    <DashboardShell
      user={user}
      title="Administration"
      standfirst="Everything that needs a decision, and the numbers behind the newsroom."
    >
      <AdminNav current="/admin" />

      {accountsUnavailable ? (
        <div className="mt-8 border-l-2 border-signal pl-4">
          <p className="text-body text-ink">Account list unavailable</p>
          <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
            The accounts service could not be reached, so figures involving
            accounts are shown as a dash rather than as zero. Everything else on
            this page is accurate.
          </p>
        </div>
      ) : null}

      <section className="pt-8">
        <h2 className="text-section text-ink">Needs attention</h2>

        {attention.length ? (
          <div className="mt-4">
            {attention.map((item) => (
              <AttentionCard key={item.title} {...item} />
            ))}
          </div>
        ) : (
          <div className="mt-3 border-l-2 border-hairline py-1 pl-4">
            <p className="text-body text-ink">Nothing is waiting on you.</p>
            <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
              No stories in review, no accounts awaiting a decision. Anything
              that needs doing will appear here.
            </p>
          </div>
        )}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">For reference</h2>
        <p className="mt-1 text-meta text-muted">
          Current state of the newsroom. Nothing here needs action.
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          {reference.map((stat) => (
            <div key={stat.label}>
              <dt className="text-meta text-muted">{stat.label}</dt>
              <dd className="mt-0.5 text-[1.6rem] tabular-nums text-ink">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Connected services</h2>
        <p className="mt-1 text-meta text-muted">
          Whether each external service is wired up. A feature that quietly does
          nothing is worse than one that says it is not configured.
        </p>
        <IntegrationStatus />
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Model keys</h2>
        <p className="mt-1 max-w-measure text-meta text-muted">
          Every key in the pool, with how much it has carried and whether a
          provider is currently refusing it. Add keys in the project&apos;s
          environment settings; they appear here after their first call.
        </p>
        <AiKeyHealth />
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Common tasks</h2>
        <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
          {[
            { href: "/admin/people", label: "Give someone editor or author access", hint: "People" },
            { href: "/admin/sections", label: "Add or remove a section from the site menu", hint: "Sections" },
            { href: "/admin/sources", label: "Add a wire feed and record what its licence permits", hint: "Wire feeds" },
            { href: "/desk/wire", label: "Review ingested wire items", hint: "Desk" },
            { href: "/desk", label: "Publish, schedule or pin a story", hint: "Desk" },
            { href: "/admin/audience", label: "See how readers are returning", hint: "Audience" },
          ].map((task) => (
            <li key={task.href} className="py-3">
              <Link href={task.href} className="text-body text-ink hover:text-accent">
                {task.label}
              </Link>
              <p className="text-meta text-muted">{task.hint}</p>
            </li>
          ))}
        </ul>
      </section>
    </DashboardShell>
  );
}
