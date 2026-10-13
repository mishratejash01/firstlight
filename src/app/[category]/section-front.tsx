import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

import { ArticleCard } from "@/components/article/article-card";
import { FeatureStory } from "@/components/article/feature-story";
import { HeroStory } from "@/components/article/hero-story";
import { SiteFooter } from "@/components/site/site-footer";
import { SectionMark } from "@/components/site/section-mark";
import { SiteHeader } from "@/components/site/site-header";
import { CaseStudyLibrary } from "@/components/case-study/case-study-library";
import { getArticlesByCategory } from "@/lib/queries/articles";
import { getCaseStudies } from "@/lib/queries/case-studies";
import { getAllSections } from "@/lib/queries/navigation";
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
    .select("slug, name, description, seo_title, layout")
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
 * The front of a section shows its lead story and thirty-one more; every older
 * story is reachable through numbered pages of thirty, linked from the foot of
 * each page. Without them, anything past the first thirty-two stories in a
 * section could only be found through the sitemap.
 *
 * The front changes pace as it goes down, as a printed section page does,
 * rather than running as one even grid after the lead. The counts below add
 * up to thirty-two and fill every row they start:
 *   - the top: the lead, two pictures beside it, six headlines on the other
 *     side;
 *   - a strip of four short pictures;
 *   - one story set big on a panel of its own;
 *   - two rows of three with their standfirsts;
 *   - twelve more as plain headlines in two columns, for the reader who is
 *     scanning by then rather than looking.
 */
const SIDE_CARDS = 2;
const SIDE_LIST = 6;
const STRIP = 4;
const FEATURE = 1;
const GRID = 6;
const MORE = 12;
const FRONT_COUNT = 1 + SIDE_CARDS + SIDE_LIST + STRIP + FEATURE + GRID + MORE;
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
  if (category.layout === "case_studies") return <CaseStudyFront category={category} page={page} />;

  // One more than the page shows, to know whether an older page exists.
  const size = page === 1 ? FRONT_COUNT : PAGE_SIZE;
  const fetched = await getArticlesByCategory(slug, size + 1, pageOffset(page));
  const hasOlder = fetched.length > size;
  const articles = fetched.slice(0, size);
  if (page > 1 && !articles.length) notFound();
  const lead = page === 1 ? articles[0] : undefined;
  const cards = page === 1 ? articles.slice(1, 1 + SIDE_CARDS) : [];
  const list =
    page === 1 ? articles.slice(1 + SIDE_CARDS, 1 + SIDE_CARDS + SIDE_LIST) : [];
  const rest =
    page === 1 ? articles.slice(1 + SIDE_CARDS + SIDE_LIST) : articles;
  // Below the top of the first page, in the order the page runs. Older pages
  // are one plain grid: a reader there is going through the archive.
  const strip = page === 1 ? rest.slice(0, STRIP) : [];
  const feature = page === 1 ? rest[STRIP] : undefined;
  const grid = page === 1 ? rest.slice(STRIP + FEATURE, STRIP + FEATURE + GRID) : rest;
  const more = page === 1 ? rest.slice(STRIP + FEATURE + GRID) : [];
  // The section's mark for the heading over the last block, from the same
  // list the footer reads (cached, and safe if the icon column is missing).
  const icon = more.length
    ? (await getAllSections()).find((section) => section.slug === category.slug)?.icon_url
    : null;

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
        {/* The section's name is already on screen, underlined in the
            navigation above, so the page opens on its stories rather than on
            a title and a description. The heading stays for screen readers
            and search engines, which still need to know what the page is. */}
        <h1 className="sr-only">
          {category.name}
          {page > 1 ? ` · page ${page}` : null}
        </h1>

        {lead ? (
          // Three columns with the lead story in the wider middle one: the
          // picture and headline that open the section sit at the centre of
          // the page, two more pictures to the left and the next six
          // headlines to the right. The lead comes first in the markup, so a
          // phone and a screen reader take it first; on a wide screen the
          // columns are put in their places by grid position. Between 1024
          // and 1280 three columns left the sides 200px wide, so there the
          // lead and the two pictures share a wide column and the headlines
          // run down the right.
          <div className="grid gap-10 pt-8 pb-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-x-9 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
            <div className="lg:col-start-1 lg:row-start-1 xl:col-start-2">
              <HeroStory article={lead} size="column" />
            </div>

            {cards.length ? (
              <div className="grid content-start gap-10 sm:grid-cols-2 lg:col-start-1 lg:row-start-2 lg:gap-9 xl:row-start-1 xl:grid-cols-1">
                {cards.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    showEyebrow={false}
                    showDek={false}
                  />
                ))}
              </div>
            ) : null}

            {list.length ? (
              <ul className="grid content-start gap-7 sm:grid-cols-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:grid-cols-1 xl:col-start-3">
                {list.map((article) => (
                  <li key={article.id}>
                    <ArticleCard
                      article={article}
                      variant="list"
                      showEyebrow={false}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : page === 1 ? (
          <p className="py-16 text-lead text-muted">
            Nothing published in this section yet.
          </p>
        ) : null}

        {strip.length ? (
          <div className="grid gap-10 pb-14 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {strip.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                showEyebrow={false}
                showDek={false}
              />
            ))}
          </div>
        ) : null}

        {feature ? (
          <div className="pb-14">
            <FeatureStory article={feature} />
          </div>
        ) : null}

        {grid.length ? (
          <div className={`story-grid pb-14 ${lead ? "" : "pt-8"}`}>
            {grid.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                showEyebrow={false}
              />
            ))}
          </div>
        ) : null}

        {more.length ? (
          <section aria-labelledby="section-more" className="pb-12">
            <h2
              id="section-more"
              className="flex items-center gap-2.5 font-headline text-[1.5rem] leading-tight font-semibold text-ink"
            >
              {icon ? <SectionMark src={icon} className="h-8 w-8" /> : null}
              More in {category.name}
            </h2>
            {/* Rows with a small picture each, three across on a wide screen:
                twelve fill four rows exactly, and the pictures line every row
                up on the same edge and the same height. */}
            <ul className="mt-6 grid gap-x-10 gap-y-7 md:grid-cols-2 xl:grid-cols-3">
              {more.map((article) => (
                <li key={article.id}>
                  <ArticleCard article={article} variant="row" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Plain links, so crawlers can walk the whole archive of the section
            one page at a time. */}
        {page > 1 || hasOlder ? (
          <nav
            aria-label={`${category.name} pages`}
            className="flex items-center justify-between py-8 text-body"
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

/** The library page count: a lead and up to seven shelves of four, then plain pages of thirty. */
const LIBRARY_FRONT = 29;
const LIBRARY_PAGE = 30;

/**
 * The Case studies section: the same shell as any section front, with the
 * library (components/case-study/case-study-library) in place of the news
 * layout, and the subjects to shelve by from the sections list.
 */
async function CaseStudyFront({
  category,
  page,
}: {
  category: { slug: string; name: string; description: string | null; seo_title: string | null };
  page: number;
}) {
  const size = page === 1 ? LIBRARY_FRONT : LIBRARY_PAGE;
  const offset = page === 1 ? 0 : LIBRARY_FRONT + (page - 2) * LIBRARY_PAGE;
  const [fetched, sections] = await Promise.all([getCaseStudies(size + 1, offset), getAllSections()]);
  const hasOlder = fetched.length > size;
  const items = fetched.slice(0, size);
  if (page > 1 && !items.length) notFound();
  const subjects = sections.filter((section) => section.slug !== category.slug && section.layout === "standard");
  const url = absoluteUrl(sectionPath(category.slug, page));

  return (
    <>
      <SiteHeader activeSlug={category.slug} />
      <JsonLd
        data={collectionPageJsonLd({
          url,
          name: page === 1 ? searchTitle(category) : `${category.name}: Page ${page}`,
          description: category.description,
          items: items.map((item) => ({ url: absoluteUrl(`/${item.categories.slug}/${item.slug}`), name: item.headline })),
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/") },
          { name: category.name, url: absoluteUrl(`/${category.slug}`) },
        ])}
      />
      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <CaseStudyLibrary
          items={items}
          subjects={subjects}
          page={page}
          hasOlder={hasOlder}
          pageHref={(n) => sectionPath(category.slug, n)}
        />
      </main>
      <SiteFooter />
    </>
  );
}
