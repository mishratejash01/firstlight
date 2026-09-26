import { articlePath, getLatestArticles } from "@/lib/queries/syndication";
import { escapeXml } from "@/lib/seo/rss";
import { sitemapResponse } from "@/lib/seo/sitemap-xml";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

/**
 * Google News sitemap.
 *
 * Separate from the main sitemaps because it needs the news namespace and a
 * two-day window: Google News reads only stories published in the last 48
 * hours, and caps the file at 1,000 entries.
 *
 * <news:name> must match the publication name Google knows the paper by, which
 * is why it is SITE_NAME and nothing else. <news:language> takes an ISO 639
 * code; for English that is "en" whatever the region.
 */
export const revalidate = 300;

const WINDOW_HOURS = 48;
const MAX_ENTRIES = 1000;

export async function GET() {
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const articles = await getLatestArticles({ limit: MAX_ENTRIES, since });

  const entries = articles
    .map(
      (article) => `  <url>
    <loc>${escapeXml(absoluteUrl(articlePath(article)))}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(SITE_NAME)}</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${escapeXml(article.published_at)}</news:publication_date>
      <news:title>${escapeXml(article.headline)}</news:title>
    </news:news>
  </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries}
</urlset>
`;

  return sitemapResponse(xml, 300);
}
