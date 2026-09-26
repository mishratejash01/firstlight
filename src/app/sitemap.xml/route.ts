import { getArticleMonths } from "@/lib/queries/syndication";
import { renderSitemapIndex, sitemapResponse } from "@/lib/seo/sitemap-xml";
import { absoluteUrl } from "@/lib/site";

/**
 * The sitemap index: one file per calendar month of stories, one for the
 * site's standing pages, one for topic pages, and the Google News sitemap for
 * the last 48 hours.
 *
 * Month files keep each sitemap well under the protocol's limit of 50,000
 * addresses however large the archive grows, and a month that is over stops
 * changing, so crawlers learn they need not fetch it again.
 */
export const revalidate = 3600;

export async function GET() {
  const months = await getArticleMonths();
  const newest = months[0]?.lastChanged ?? null;

  const xml = renderSitemapIndex([
    { loc: absoluteUrl("/news-sitemap.xml"), lastmod: newest },
    { loc: absoluteUrl("/sitemaps/pages.xml"), lastmod: newest },
    { loc: absoluteUrl("/sitemaps/topics.xml"), lastmod: newest },
    ...months.map((month) => ({
      loc: absoluteUrl(`/sitemaps/articles/${month.key}.xml`),
      lastmod: month.lastChanged,
    })),
  ]);

  return sitemapResponse(xml);
}
