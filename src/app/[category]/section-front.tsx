import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

import { ArticleCard } from "@/components/article/article-card";
import { HeroStory } from "@/components/article/hero-story";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getArticlesByCategory } from "@/lib/queries/articles";
import { createAnonymousClient } from "@/lib/supabase/anonymous";

/**
 * A section front, shared by its first page (/politics) and the numbered pages
 * of older stories behind it (/politics/page/2).
 *
 * The page number is part of the path rather than a ?page= query because a
 * page that reads its query string has to be rendered afresh for every
 * request; in the path, each page is cached at the edge like any other.
 */

async function getCategory(slug: string) {
  const supabase = createAnonymousClient();
  const { data } = await supabase
    .from("categories")
    .select("slug, name, description, seo_title")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

/**
 * The section's title in search results. A section's name is written for the
 * menu ("Sport"); the title uses the words people search with ("Sports News
 * Today: Cricket, IPL, Football and More"), which editors set per section.
 * A section without one still gets the words most news searches use.
 */
function searchTitle(category: { name: string; seo_title: string | null }): string {
  return category.seo_title?.trim() || `${category.name} News Today`;
}

/**
 * The front of a section shows its lead story and thirty more; every older
 * story is reachable through numbered pages of thirty, linked from the foot of
 * each page. Without them, anything past the first thirty-one stories in a
 * section could only be found through the sitemap.
 */
const FRONT_COUNT = 31;
const PAGE_SIZE = 30;

function pageOffset(page: number): number {
  return page === 1 ? 0 : FRONT_COUNT + (page - 2) * PAGE_SIZE;
}

/** Where page `page` of a section lives: the front itself for page 1. */
export function sectionPath(slug: string, page: number): string {
  return page === 1 ? `/${slug}` : `/${slug}/page/${page}`;
}

export async function sectionMetadata(slug: string, page: number): Promise<Metadata> {
  const category = await getCategory(slug);
  if (!category) return { title: "Not found" };
  const [latest] = await getArticlesByCategory(slug, 1, pageOffset(page));

  if (page > 1) {
    return pageMetadata({
      title: `${category.name} News: Page ${page}`,
      description: `Earlier ${category.name.toLowerCase()} stories from ${SITE_NAME}, page ${page}.`,
      path: sectionPath(category.slug, page),
      noindex: !latest,
    });
  }

  return pageMetadata({
    title: searchTitle(category),
    description:
      category.description ??
      `The latest ${category.name.toLowerCase()} news and reporting from ${SITE_NAME}.`,
    path: sectionPath(category.slug, 1),
    rss: {
      url: absoluteUrl(`/${category.slug}/feed.xml`),
      title: `${category.name} - ${SITE_NAME}`,
    },
    // A section with nothing in it yet is an empty page to a search engine.
    noindex: !latest,
  });
}

export async function SectionFront({ slug, page }: { slug: string; page: number }) {
  const category = await getCategory(slug);
  if (!category) notFound();

  // One more than the page shows, to know whether an older page exists.
  const size = page === 1 ? FRONT_COUNT : PAGE_SIZE;
  const fetched = await getArticlesByCategory(slug, size + 1, pageOffset(page));
  const hasOlder = fetched.length > size;
  const articles = fetched.slice(0, size);
  if (page > 1 && !articles.length) notFound();
  const lead = page === 1 ? articles[0] : undefined;
  const rest = page === 1 ? articles.slice(1) : articles;

  const url = absoluteUrl(sectionPath(category.slug, page));
  const pageHref = (n: number) => sectionPath(category.slug, n);

  return (
    <>
      <SiteHeader activeSlug={category.slug} />

      <JsonLd
        data={collectionPageJsonLd({
          url,
          name: page === 1 ? searchTitle(category) : `${category.name} News: Page ${page}`,
          description: category.description,
          items: articles.map((article) => ({
            url: absoluteUrl(`/${article.categories.slug}/${article.slug}`),
            name: article.headline,
          })),
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/") },
          { name: category.name, url: absoluteUrl(`/${category.slug}`) },
        ])}
      />

      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <div className="border-b border-hairline py-8">
          <h1 className="text-hero font-bold tracking-[-0.02em] text-ink">
            {category.name}
            {page > 1 ? <span className="text-muted"> · page {page}</span> : null}
          </h1>
          {category.description ? (
            <p className="mt-2 max-w-measure text-lead text-muted">
              {category.description}
            </p>
          ) : null}
        </div>

        {lead ? (
          <div className="py-10">
            <HeroStory article={lead} />
          </div>
        ) : page === 1 ? (
          <p className="py-16 text-lead text-muted">
            Nothing published in this section yet.
          </p>
        ) : null}

        {rest.length ? (
          <div className="story-grid border-t border-hairline py-10">
            {rest.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                showEyebrow={false}
              />
            ))}
          </div>
        ) : null}

        {/* Plain links, so crawlers can walk the whole archive of the section
            one page at a time. */}
        {page > 1 || hasOlder ? (
          <nav
            aria-label={`${category.name} pages`}
            className="flex items-center justify-between border-t border-hairline py-8 text-body"
          >
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="text-accent underline underline-offset-4">
                Newer stories
              </Link>
            ) : (
              <span />
            )}
            {hasOlder ? (
              <Link href={pageHref(page + 1)} className="text-accent underline underline-offset-4">
                Older stories
              </Link>
            ) : null}
          </nav>
        ) : null}
      </main>

      <SiteFooter />
    </>
  );
}
