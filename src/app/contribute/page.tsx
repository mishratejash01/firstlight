import Link from "next/link";
import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { NewDraftForm } from "@/components/dashboard/new-draft-form";
import { requireAuthor } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format/datetime";

export const metadata: Metadata = {
  title: "My work",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Contributor dashboard.
 *
 * Lists the caller's own work at every stage. The query has no author filter,
 * because it does not need one: the articles read policy already restricts a
 * contributor to rows they created plus everything already public. The filter
 * below removes the public rows, not the private ones.
 */
export default async function ContributePage() {
  const user = await requireAuthor("/contribute");
  const supabase = await createClient();

  const [{ data: articles }, { data: categories }] = await Promise.all([
    supabase
      .from("articles")
      .select("id, slug, headline, status, updated_at, published_at, categories ( slug, name )")
      .eq("created_by", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <DashboardShell
      user={user}
      title="My work"
      standfirst="Drafts, submissions and published pieces."
    >
      <NewDraftForm categories={categories ?? []} />

      <section className="mt-10">
        <h2 className="font-serif text-section text-ink">Your articles</h2>

        {articles?.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {articles.map((article) => (
              <li key={article.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-[1.05rem] leading-snug text-ink">
                    <Link href={`/contribute/${article.id}`} className="hover:text-accent">
                      {article.headline}
                    </Link>
                  </h3>
                  <p className="mt-1 text-meta text-muted">
                    {article.categories?.name} · updated {formatDateTime(article.updated_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-baseline gap-4">
                  <StatusBadge status={article.status} />
                  {article.status === "published" && article.categories ? (
                    <Link
                      href={`/${article.categories.slug}/${article.slug}`}
                      className="text-meta text-accent hover:underline underline-offset-4"
                    >
                      View
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-body text-muted">
            Nothing filed yet. Start a draft above.
          </p>
        )}
      </section>
    </DashboardShell>
  );
}
