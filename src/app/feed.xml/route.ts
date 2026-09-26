import { getLatestArticles } from "@/lib/queries/syndication";
import { toFeedItem } from "@/lib/seo/feed-items";
import { RSS_HEADERS, renderRss } from "@/lib/seo/rss";
import {
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_NAME,
  absoluteUrl,
} from "@/lib/site";

/**
 * The paper's main RSS feed: the fifty newest stories from every section.
 * Section feeds live at /<section>/feed.xml.
 */
export const revalidate = 300;

export async function GET() {
  const articles = await getLatestArticles({ limit: 50 });

  const xml = renderRss({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteUrl: absoluteUrl("/"),
    selfUrl: absoluteUrl("/feed.xml"),
    language: SITE_LANGUAGE.toLowerCase(),
    imageUrl: absoluteUrl("/icon/96"),
    items: articles.map(toFeedItem),
  });

  return new Response(xml, { headers: RSS_HEADERS });
}
