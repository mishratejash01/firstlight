import { escapeXml } from "@/lib/seo/rss";

/**
 * Sitemap XML, written by hand so every file can carry the image extension and
 * the index can point at month files and the news sitemap alike.
 *
 * No changefreq or priority: Google has said it ignores both, and a file full
 * of values nobody reads only makes the sitemap longer. lastmod is included
 * only where it is true, which is why articles use the time their text last
 * changed rather than the row's updated_at.
 */

export type SitemapUrl = {
  loc: string;
  lastmod?: string | null;
  images?: string[];
};

export function renderUrlset(urls: SitemapUrl[]): string {
  const hasImages = urls.some((url) => url.images?.length);
  const body = urls
    .map((url) => {
      const parts = [`    <loc>${escapeXml(url.loc)}</loc>`];
      if (url.lastmod) parts.push(`    <lastmod>${escapeXml(url.lastmod)}</lastmod>`);
      for (const image of url.images ?? []) {
        parts.push(`    <image:image><image:loc>${escapeXml(image)}</image:loc></image:image>`);
      }
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${
    hasImages ? `\n        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"` : ""
  }>
${body}
</urlset>
`;
}

export function renderSitemapIndex(entries: { loc: string; lastmod?: string | null }[]): string {
  const body = entries
    .map(
      (entry) =>
        `  <sitemap>\n    <loc>${escapeXml(entry.loc)}</loc>${
          entry.lastmod ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ""
        }\n  </sitemap>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>
`;
}

export function sitemapResponse(xml: string, maxAgeSeconds = 3600): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 4}`,
    },
  });
}
