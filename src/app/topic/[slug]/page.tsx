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
import { FollowButton } from "@/components/follow/follow-button";

/**
 * Cached like any other public page, and rebuilt at most once an hour. The
 * follow button finds out who is reading in the browser, so the page is the
 * same for everyone and can be served from the cache; it used to be built
 * afresh for every visitor, and there are well over a thousand topics for
 * crawlers to walk.
 */
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

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

/**
 * The topic's title in search results, in the words news searches use:
 * "Narendra Modi News Today: Latest Updates". A long name gets a shorter form,
 * so the result is not cut off mid-phrase, and a name that already ends in
 * "news" does not get the word twice.
 */
function searchTitle(name: string): string {
  const base = /\bnews$/i.test(name) ? name : `${name} News`;
  const options = [`${base} Today: Latest Updates`, `${base} Today`, base];
  return options.find((title) => title.length <= 45) ?? base;
}

export async function generateMetadata(
  props: PageProps<"/topic/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const { tag, articles } = await getArticlesByTag(slug, 40);
  if (!tag) return { title: "Not found" };

  const name = displayTopicName(tag.name);
  return pageMetadata({
    title: searchTitle(name),
    description:
      tag.description ??
      `Latest ${name} news and updates from ${SITE_NAME}, with the newest stories on ${name} in one place.`,
    path: `/topic/${tag.slug}`,
    noindex: !(await isIndexable(tag.slug, articles.length)),
  });
}

export default async function TopicPage(props: PageProps<"/topic/[slug]">) {
  const { slug } = await props.params;
  const { tag, articles } = await getArticlesByTag(slug, 40);
  if (!tag) notFound();

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
              name: searchTitle(name),
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
