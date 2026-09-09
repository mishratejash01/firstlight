import type { Metadata } from "next";

import { ActionButton } from "@/components/dashboard/action-button";
import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { setCategoryVisibility } from "@/app/admin/actions";

export const metadata: Metadata = {
  title: "Sections — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Site sections.
 *
 * Split into two lists rather than one list with a status column, because the
 * question an administrator actually arrives with is "what is in the menu?" —
 * and a twenty-row table where the answer is a word in the third column does
 * not answer it at a glance.
 *
 * Hidden sections still exist and still have working URLs. That matters: wire
 * content routed by IPTC subject code needs somewhere to land even when the
 * section is not worth a menu slot.
 */
export default async function AdminSectionsPage() {
  const user = await requireAdmin("/admin/sections");
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, slug, name, description, show_in_nav, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const inNav = (categories ?? []).filter((c) => c.show_in_nav);
  const hidden = (categories ?? []).filter((c) => !c.show_in_nav);

  const row = (
    category: NonNullable<typeof categories>[number],
    action: { label: string; value: string },
  ) => (
    <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0">
        <p className="text-body text-ink">{category.name}</p>
        <p className="text-meta text-muted">
          newswebsite-pi.vercel.app/{category.slug}
        </p>
      </div>
      <ActionButton
        action={setCategoryVisibility}
        hidden={{ category_id: category.id, show_in_nav: action.value }}
        label={action.label}
        pendingLabel="Updating…"
      />
    </li>
  );

  return (
    <DashboardShell
      user={user}
      title="Sections"
      standfirst="What appears in the site menu. Changes are live immediately."
    >
      <AdminNav current="/admin/sections" />

      <section className="pt-8">
        <h2 className="font-serif text-section text-ink">
          In the menu ({inNav.length})
        </h2>
        <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
          These appear in the header on every page, in this order. The menu is
          read from the database, so removing one takes effect on the next page
          load — no deploy needed.
        </p>
        <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
          {inNav.map((category) =>
            row(category, { label: "Remove from menu", value: "false" }),
          )}
        </ul>
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="font-serif text-section text-ink">
          Not in the menu ({hidden.length})
        </h2>
        <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
          These sections still work and still have pages — they are simply not
          shown in the header. Wire copy tagged with their subject code still has
          somewhere to be filed.
        </p>
        <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
          {hidden.map((category) =>
            row(category, { label: "Add to menu", value: "true" }),
          )}
        </ul>
      </section>
    </DashboardShell>
  );
}
