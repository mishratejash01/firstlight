import {
  articlePath,
  getArticlesPublishedBetween,
  lastChanged,
  monthBounds,
} from "@/lib/queries/syndication";
import { ARTICLE_IMAGE_SHAPES, cloudinaryCrop } from "@/lib/media/transform";
import { renderUrlset, sitemapResponse } from "@/lib/seo/sitemap-xml";
import { absoluteUrl } from "@/lib/site";

/**
 * Every story published in one UTC month, at /sitemaps/articles/YYYY-MM.xml,
 * each with the time its text last changed and its lead picture.
 *
 * A past month hardly ever changes, so it is cached for a day; the current
 * month for fifteen minutes.
 */
export const revalidate = 900;

const MONTH_FILE = /^(\d{4})-(\d{2})\.xml$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ month: string }> },
) {
  const { month } = await params;
  const match = MONTH_FILE.exec(month);
  if (!match) return new Response("Not found", { status: 404 });

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return new Response("Not found", { status: 404 });

  const { start, end } = monthBounds(year, monthIndex);
  if (start > new Date().toISOString()) return new Response("Not found", { status: 404 });

  const articles = await getArticlesPublishedBetween(start, end);
  if (!articles.length) return new Response("Not found", { status: 404 });

  const [wide] = ARTICLE_IMAGE_SHAPES;
  const urls = articles.map((article) => {
    const image = cloudinaryCrop(article.hero_image_url, wide.width, wide.height) ?? article.hero_image_url;
    return {
      loc: absoluteUrl(articlePath(article)),
      lastmod: lastChanged(article),
      images: image ? [image] : [],
    };
  });

  const isPast = end <= new Date().toISOString();
  return sitemapResponse(renderUrlset(urls), isPast ? 86400 : 900);
}
