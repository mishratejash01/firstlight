import type { Metadata } from "next";

import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { RoleToggle } from "@/components/dashboard/role-toggle";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format/datetime";
import { listAccounts } from "@/app/admin/actions";

export const metadata: Metadata = {
  title: "People — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ROLES = [
  {
    role: "author" as const,
    label: "Author",
    can: "Write and submit drafts. Cannot publish.",
  },
  {
    role: "editor" as const,
    label: "Editor",
    can: "Review, edit, publish, schedule and pin stories.",
  },
  {
    role: "admin" as const,
    label: "Admin",
    can: "Everything an editor can do, plus manage people and sections.",
  },
];

/**
 * Accounts and access.
 *
 * One row per person, three buttons. A highlighted button means the person has
 * that access; pressing it takes it away, pressing a plain one grants it. There
 * is no separate save step and no dropdown, because the previous design needed
 * a dropdown, a grant button and a revoke button to express what is really
 * three yes/no facts.
 *
 * People with no role are listed first: they are the ones most likely to be
 * waiting on someone here.
 */
export default async function AdminPeoplePage() {
  const user = await requireAdmin("/admin/people");
  const supabase = await createClient();

  const [accountResult, roleRows, authorRows] = await Promise.all([
    listAccounts(),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("authors").select("user_id, display_name"),
  ]);

  const accounts = accountResult.ok ? accountResult.accounts : [];

  const rolesByUser = new Map<string, Set<string>>();
  for (const row of roleRows.data ?? []) {
    const set = rolesByUser.get(row.user_id) ?? new Set<string>();
    set.add(row.role);
    rolesByUser.set(row.user_id, set);
  }

  const nameByUser = new Map(
    (authorRows.data ?? [])
      .filter((a) => a.user_id)
      .map((a) => [a.user_id as string, a.display_name]),
  );

  // Accounts with nothing granted come first — those are the pending decisions.
  const sorted = [...accounts].sort((a, b) => {
    const aHas = (rolesByUser.get(a.id)?.size ?? 0) > 0;
    const bHas = (rolesByUser.get(b.id)?.size ?? 0) > 0;
    if (aHas !== bHas) return aHas ? 1 : -1;
    return (a.email ?? "").localeCompare(b.email ?? "");
  });

  return (
    <DashboardShell
      user={user}
      title="People"
      standfirst="Who can do what. Changes take effect immediately."
    >
      <AdminNav current="/admin/people" />

      <section className="pt-8">
        <h2 className="font-serif text-section text-ink">What each role can do</h2>
        <dl className="mt-4 divide-y divide-hairline border-t border-hairline">
          {ROLES.map((role) => (
            <div key={role.role} className="py-3">
              <dt className="text-body text-ink">{role.label}</dt>
              <dd className="mt-0.5 text-meta text-muted">{role.can}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-measure text-meta leading-relaxed text-muted">
          Signing in with Google creates a reader account with none of the above.
          Access exists only where it is granted here, and is enforced by the
          database rather than by hiding buttons.
        </p>
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="font-serif text-section text-ink">
          Accounts{accountResult.ok ? ` (${accounts.length})` : ""}
        </h2>

        {!accountResult.ok ? (
          <div className="mt-3 border-l-2 border-signal pl-4">
            <p className="text-body text-ink">Could not load the account list.</p>
            <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
              {accountResult.reason} No access has been changed. Reload to try
              again — an empty list here would be misleading, so none is shown.
            </p>
          </div>
        ) : null}

        <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
          {sorted.map((account) => {
            const roles = rolesByUser.get(account.id) ?? new Set<string>();
            const isYou = account.id === user.id;

            return (
              <li key={account.id} className="py-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-body text-ink">
                    {nameByUser.get(account.id) ?? account.email ?? account.id}
                    {isYou ? <span className="text-muted"> (you)</span> : null}
                  </p>
                  {nameByUser.get(account.id) && account.email ? (
                    <p className="text-meta text-muted">{account.email}</p>
                  ) : null}
                </div>

                <p className="mt-0.5 text-meta text-muted">
                  {roles.size === 0
                    ? "Reader — no newsroom access"
                    : `Access: ${[...roles].join(", ")}`}
                  {" · "}
                  joined {formatDate(account.createdAt)}
                  {account.lastSignInAt
                    ? ` · last seen ${formatDate(account.lastSignInAt)}`
                    : ""}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {ROLES.map((role) => (
                    <RoleToggle
                      key={role.role}
                      userId={account.id}
                      role={role.role}
                      label={role.label}
                      granted={roles.has(role.role)}
                      personLabel={
                        nameByUser.get(account.id) ?? account.email ?? "this account"
                      }
                    />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-6 max-w-measure text-meta leading-relaxed text-muted">
          A highlighted button means the person has that access. Press it to take
          it away; press a plain one to grant it. Granting editor or admin asks
          you to confirm first, because both let someone publish to the live
          site. You cannot remove your own administrator access — that would
          lock the newsroom out of its own settings.
        </p>
      </section>
    </DashboardShell>
  );
}
