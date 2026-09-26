import {
  getLatestArticles,
  getLiveCoverage,
  getPublishingAuthors,
  getSections,
} from "@/lib/queries/syndication";
import { renderUrlset, sitemapResponse, type SitemapUrl } from "@/lib/seo/sitemap-xml";
import { PUBLISHER, absoluteUrl } from "@/lib/site";

/**
 * The site's standing pages: the front page, every section, live-coverage
 * hubs, the writers who have published, and the pages that say who runs the
 * paper and by what rules. A section's lastmod is its newest story's time, so
 * crawlers can tell which fronts have moved.
 */
export const revalidate = 3600;

/** Pages whose content is fixed prose; they carry no lastmod rather than a false one. */
// /breaking is left out: it is empty whenever nothing is flagged, and then
// carries noindex, which a sitemap entry would contradict.
const STANDING_PAGES = [
  "/sections",
  "/bulletin",
  "/about",
  "/masthead",
  "/editorial-standards",
  "/corrections",
  "/privacy",
];

export async function GET() {
  const [sections, live, authors, newest] = await Promise.all([
    getSections(),
    getLiveCoverage(),
    getPublishingAuthors(),
    getLatestArticles({ limit: 1 }),
  ]);

  const sectionLatest = await Promise.all(
    sections.map(async (section) => {
      const [latest] = await getLatestArticles({ limit: 1, categorySlug: section.slug });
      return { slug: section.slug, lastmod: latest?.published_at ?? null };
    }),
  );

  const urls: SitemapUrl[] = [
    { loc: absoluteUrl("/"), lastmod: newest[0]?.published_at ?? null },
    // A section with nothing published yet is an empty page; leave it out
    // until it has a story.
    ...sectionLatest
      .filter((section) => section.lastmod)
      .map((section) => ({ loc: absoluteUrl(`/${section.slug}`), lastmod: section.lastmod })),
    ...live.map((event) => ({ loc: absoluteUrl(`/live/${event.slug}`), lastmod: event.updated_at })),
    ...authors.map((author) => ({
      loc: absoluteUrl(`/author/${author.slug}`),
      lastmod: author.lastPublished,
    })),
    ...STANDING_PAGES
      // The masthead is noindex until it has someone to list.
      .filter(
        (path) =>
          path !== "/masthead" ||
          Boolean(PUBLISHER.editor.name || PUBLISHER.legalName || authors.length),
      )
      .map((path) => ({ loc: absoluteUrl(path) })),
  ];

  return sitemapResponse(renderUrlset(urls));
}
