import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ArticleEditor } from "@/components/dashboard/article-editor";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { UnverifiedClaims } from "@/components/dashboard/unverified-claims";
import { requireAuthor } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format/datetime";

export const metadata: Metadata = {
  title: "Edit draft",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditDraftPage(props: PageProps<"/contribute/[id]">) {
  const { id } = await props.params;
  const user = await requireAuthor(`/contribute/${id}`);
  const supabase = await createClient();

  const [{ data: article }, { data: categories }] = await Promise.all([
    supabase
      .from("articles")
      .select("id, slug, headline, standfirst, body, summary, status, category_id, updated_at, hero_image_url, hero_image_alt, hero_image_credit, ai_assisted, ai_model, ai_unverified_claims, search_keywords, categories ( slug, name )")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  // Not found rather than forbidden. RLS has already decided this row is
  // invisible to the caller, and saying "this exists but is not yours" would
  // confirm the existence of someone else's unpublished work.
  if (!article) notFound();

  const { data: versions } = await supabase
    .from("article_versions")
    .select("version_number, headline, status, change_note, created_at")
    .eq("article_id", id)
    .order("version_number", { ascending: false })
    .limit(10);

  const editable = ["draft", "in_review", "rejected"].includes(article.status);

  return (
    <DashboardShell
      user={user}
      title={article.headline}
      standfirst={`${article.categories?.name ?? ""} · last saved ${formatDateTime(article.updated_at)}`}
      actions={<StatusBadge status={article.status} />}
    >
      <UnverifiedClaims claims={article.ai_unverified_claims ?? []} />

      {/* What the drafting step researched this story to be found for, so
          the editor can see it before touching the headline. */}
      {article.search_keywords?.length ? (
        <p className="mb-6 max-w-measure text-meta leading-relaxed text-muted">
          Written to be found for: {article.search_keywords.join(", ")}
        </p>
      ) : null}

      {editable ? (
        <ArticleEditor article={article} categories={categories ?? []} />
      ) : (
        <div className="border-l-2 border-hairline pl-4">
          <p className="text-body text-ink">
            This piece is with the desk and can no longer be edited here.
          </p>
          <p className="mt-1 text-meta text-muted">
            Once an editor takes a story on, further changes are made by them so
            two people cannot overwrite each other mid-edit.
          </p>
        </div>
      )}

      {versions?.length ? (
        <section className="mt-10 border-t border-hairline pt-6">
          <h2 className="text-section text-ink">History</h2>
          <p className="mt-1 text-meta text-muted">
            Written automatically on every change. It cannot be edited or deleted
            from this interface by anyone, including administrators.
          </p>
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {versions.map((version) => (
              <li key={version.version_number} className="py-3">
                <p className="text-meta text-ink">
                  Version {version.version_number} · {formatDateTime(version.created_at)}
                </p>
                <p className="mt-0.5 text-meta text-muted">{version.headline}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 text-meta">
        <Link href="/contribute" className="text-accent hover:underline underline-offset-4">
          Back to my work
        </Link>
      </p>
    </DashboardShell>
  );
}
