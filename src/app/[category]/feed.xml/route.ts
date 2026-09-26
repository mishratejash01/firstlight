import { getLatestArticles, getSection } from "@/lib/queries/syndication";
import { toFeedItem } from "@/lib/seo/feed-items";
import { RSS_HEADERS, renderRss } from "@/lib/seo/rss";
import { SITE_LANGUAGE, SITE_NAME, absoluteUrl } from "@/lib/site";

/**
 * One section's RSS feed: its fifty newest stories. Aggregators that file
 * stories by subject take a feed per section rather than one for everything.
 */
export const revalidate = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  const { category } = await params;
  const section = await getSection(category);
  if (!section) return new Response("Not found", { status: 404 });

  const articles = await getLatestArticles({ limit: 50, categorySlug: section.slug });

  const xml = renderRss({
    title: `${section.name} | ${SITE_NAME}`,
    description: section.description ?? `${section.name} coverage from ${SITE_NAME}.`,
    siteUrl: absoluteUrl(`/${section.slug}`),
    selfUrl: absoluteUrl(`/${section.slug}/feed.xml`),
    language: SITE_LANGUAGE.toLowerCase(),
    imageUrl: absoluteUrl("/icon/96"),
    items: articles.map(toFeedItem),
  });

  return new Response(xml, { headers: RSS_HEADERS });
}
