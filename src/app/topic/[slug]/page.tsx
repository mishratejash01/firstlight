import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ArticleCard } from "@/components/article/article-card";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getArticlesByTag } from "@/lib/queries/articles";
import { getFollowState } from "@/lib/queries/follows";
import { FollowButton } from "@/components/follow/follow-button";

export const revalidate = 300;

export async function generateMetadata(
  props: PageProps<"/topic/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const { tag } = await getArticlesByTag(slug, 1);
  if (!tag) return { title: "Not found" };

  return {
    title: `${tag.name} — Newswebsite`,
    description: tag.description ?? `Coverage tagged ${tag.name}.`,
    alternates: { canonical: `/topic/${tag.slug}` },
  };
}

export default async function TopicPage(props: PageProps<"/topic/[slug]">) {
  const { slug } = await props.params;
  const { tag, articles } = await getArticlesByTag(slug, 40);
  if (!tag) notFound();

  const follow = await getFollowState("tag", tag.id);

  return (
    <>
      <SiteHeader />

      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <div className="border-b border-hairline py-8">
          <p className="text-meta text-muted">Topic</p>
          <h1 className="mt-1 text-hero text-ink">{tag.name}</h1>
          {tag.description ? (
            <p className="mt-2 max-w-measure text-lead text-muted">{tag.description}</p>
          ) : null}
          <div className="mt-4">
            <FollowButton
              targetType="tag"
              targetId={tag.id}
              label={tag.name}
              isSignedIn={follow.isSignedIn}
              initiallyFollowing={follow.following}
              followId={follow.followId}
              returnTo={`/topic/${tag.slug}`}
            />
          </div>
        </div>

        {articles.length ? (
          <div className="story-grid py-10">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        ) : (
          <p className="py-16 text-lead text-muted">Nothing tagged {tag.name} yet.</p>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
