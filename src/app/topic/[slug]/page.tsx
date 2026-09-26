import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import {
  MIN_INDEXABLE_TOPIC_STORIES,
  getSections,
} from "@/lib/queries/syndication";
import {
  breadcrumbJsonLd,
  collectionPageJsonLd,
} from "@/lib/seo/json-ld";
import { displayTopicName, pageMetadata } from "@/lib/seo/metadata";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

import { ArticleCard } from "@/components/article/article-card";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getArticlesByTag } from "@/lib/queries/articles";
import { getFollowState } from "@/lib/queries/follows";
import { FollowButton } from "@/components/follow/follow-button";

export const revalidate = 300;

/**
 * Whether a topic page is offered to search engines: it needs enough stories
 * to be a real collection, and must not be a second copy of a section front
 * with the same name. The topics sitemap applies the same two rules.
 */
async function isIndexable(slug: string, storyCount: number) {
  if (storyCount < MIN_INDEXABLE_TOPIC_STORIES) return false;
  const sections = await getSections();
  return !sections.some((section) => section.slug === slug);
}

export async function generateMetadata(
  props: PageProps<"/topic/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const { tag, articles } = await getArticlesByTag(slug, 40);
  if (!tag) return { title: "Not found" };

  const name = displayTopicName(tag.name);
  return pageMetadata({
    title: `${name}: latest news`,
    description:
      tag.description ?? `The latest news and reporting on ${name} from ${SITE_NAME}.`,
    path: `/topic/${tag.slug}`,
    noindex: !(await isIndexable(tag.slug, articles.length)),
  });
}

export default async function TopicPage(props: PageProps<"/topic/[slug]">) {
  const { slug } = await props.params;
  const { tag, articles } = await getArticlesByTag(slug, 40);
  if (!tag) notFound();

  const follow = await getFollowState("tag", tag.id);
  const name = displayTopicName(tag.name);
  const url = absoluteUrl(`/topic/${tag.slug}`);
  const indexable = await isIndexable(tag.slug, articles.length);

  return (
    <>
      <SiteHeader />

      {indexable ? (
        <>
          <JsonLd
            data={collectionPageJsonLd({
              url,
              name: `${name}: latest news`,
              description: tag.description,
              about: { name },
              items: articles.map((article) => ({
                url: absoluteUrl(`/${article.categories.slug}/${article.slug}`),
                name: article.headline,
              })),
            })}
          />
          <JsonLd
            data={breadcrumbJsonLd([
              { name: "Home", url: absoluteUrl("/") },
              { name, url },
            ])}
          />
        </>
      ) : null}

      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <div className="border-b border-hairline py-8">
          <p className="text-meta text-muted">Topic</p>
          <h1 className="mt-1 text-hero text-ink">{name}</h1>
          {tag.description ? (
            <p className="mt-2 max-w-measure text-lead text-muted">{tag.description}</p>
          ) : null}
          <div className="mt-4">
            <FollowButton
              targetType="tag"
              targetId={tag.id}
              label={name}
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
          <p className="py-16 text-lead text-muted">Nothing tagged {name} yet.</p>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
