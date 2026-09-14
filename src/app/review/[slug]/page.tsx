import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ReviewPanel } from "@/components/review/review-panel";
import { requireReviewer } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderMarkdown } from "@/lib/format/markdown";
import { formatDateTime } from "@/lib/format/datetime";
import { cloudinaryImage } from "@/lib/media/transform";

export const metadata: Metadata = {
  title: "Review a story — Newsroom",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One story, as readers saw it, with the facts a verdict needs alongside:
 * when the world first reported it, when we published, which outlets were
 * on it. The panel at the foot asks the questions.
 *
 * The mention timeline is read with the service role because those rows
 * belong to the engine, not to the reviewer; the page itself is guarded by
 * the reviewer role and shows nothing a published page does not, plus the
 * timeline.
 */
export default async function ReviewStoryPage(props: { params: Promise<{ slug: string }> }) {
  const user = await requireReviewer("/review");
  const { slug } = await props.params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: article } = await admin
    .from("articles")
    .select(
      "id, slug, headline, standfirst, body, published_at, hero_image_url, hero_image_alt, hero_image_credit, category_id, categories ( id, name, slug )",
    )
    .eq("slug", slug)
    .in("status", ["published", "scheduled"])
    .maybeSingle();
  if (!article) notFound();

  const category = article.categories as unknown as { id: string; name: string; slug: string } | null;

  const [{ data: event }, { data: sections }, { data: mine }] = await Promise.all([
    admin
      .from("story_events")
      .select("id, first_seen_at, created_at, source_count")
      .eq("article_id", article.id)
      .maybeSingle(),
    admin.from("categories").select("id, name").eq("is_active", true).eq("show_in_nav", true).order("sort_order"),
    supabase.from("article_reviews").select("id, created_at").eq("article_id", article.id).eq("reviewer_id", user.id).maybeSingle(),
  ]);

  const { data: mentions } = event
    ? await admin
        .from("signal_mentions")
        .select("source_key, source_kind, observed_at, title")
        .eq("event_id", event.id)
        .order("observed_at", { ascending: true })
        .limit(60)
    : { data: [] as { source_key: string; source_kind: string; observed_at: string; title: string }[] };

  const firstReport = mentions?.[0]?.observed_at ?? event?.first_seen_at ?? null;
  const outlets = [...new Set((mentions ?? []).map((m) => m.source_key).filter((k) => k && !k.startsWith("bsky") && k !== "news.google.com"))];
  const lagMinutes = firstReport && article.published_at
    ? Math.round((new Date(article.published_at).getTime() - new Date(firstReport).getTime()) / 60_000)
    : null;

  return (
    <DashboardShell
      user={user}
      title="Review"
      standfirst={category ? `${category.name}. Read it as a reader would, then answer below.` : "Read it as a reader would, then answer below."}
      actions={
        <span className="flex items-center gap-4">
          <Link href={`/${category?.slug ?? ""}/${article.slug}`} target="_blank" rel="noopener" className="text-meta text-accent hover:underline underline-offset-4">
            Open the live page
          </Link>
          <Link href="/review/next" className="text-meta text-muted hover:text-accent">
            Skip this one
          </Link>
        </span>
      }
    >
      <div className="mx-auto max-w-[44rem]">
        <article className="pt-8">
          <h1 className="headline-lg text-hero leading-[1.08] text-ink sm:text-[2.4rem]">{article.headline}</h1>
          {article.standfirst ? (
            <p className="mt-4 text-[1.1rem] leading-[1.5] text-muted">{article.standfirst}</p>
          ) : null}

          <div className="mt-5 border-y border-hairline py-3 text-meta text-muted">
            <p>
              {firstReport ? `First reported ${formatDateTime(firstReport)}` : "First report time unknown"}
              {article.published_at ? ` · we published ${formatDateTime(article.published_at)}` : ""}
              {lagMinutes != null ? ` · ${lagMinutes >= 60 ? `${Math.floor(lagMinutes / 60)} h ${lagMinutes % 60} min` : `${lagMinutes} min`} after the first report` : ""}
            </p>
            {outlets.length ? (
              <p className="mt-1">On it: {outlets.slice(0, 14).join(", ")}{outlets.length > 14 ? ` and ${outlets.length - 14} more` : ""}</p>
            ) : (
              <p className="mt-1">No outlet timeline recorded for this story.</p>
            )}
          </div>

          {article.hero_image_url ? (
            <figure className="mt-6">
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-hairline">
                <Image
                  src={cloudinaryImage(article.hero_image_url, "hero") ?? article.hero_image_url}
                  alt={article.hero_image_alt ?? ""}
                  fill
                  sizes="(max-width: 1024px) 100vw, 704px"
                  className="object-cover"
                />
              </div>
              {article.hero_image_alt || article.hero_image_credit ? (
                <figcaption className="mt-2 text-meta text-muted">
                  {article.hero_image_alt}
                  {article.hero_image_credit ? ` · ${article.hero_image_credit}` : ""}
                </figcaption>
              ) : null}
            </figure>
          ) : (
            <p className="mt-6 text-meta text-signal">This story has no picture.</p>
          )}

          <div className="mt-7">{renderMarkdown(article.body ?? "")}</div>
        </article>

        {mine ? (
          <div className="mt-10 border-t border-hairline pt-4 text-body text-muted">
            You reviewed this story {formatDateTime(mine.created_at)}.{" "}
            <Link href="/review/next" className="text-accent hover:underline underline-offset-4">Next story</Link>
          </div>
        ) : (
          <ReviewPanel
            articleId={article.id}
            eventId={event?.id ?? null}
            sections={(sections ?? []).map((s) => ({ id: s.id, name: s.name }))}
            currentSectionId={article.category_id}
          />
        )}
      </div>
    </DashboardShell>
  );
}
