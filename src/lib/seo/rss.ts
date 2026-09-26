/**
 * RSS 2.0, for feed readers and the aggregators that still run on feeds:
 * Google News's publisher tools, Feedly, Inoreader, NewsNow, Flipboard and the
 * Indian news apps that take partner feeds.
 *
 * Each item carries the standfirst rather than the whole story. A feed is a
 * notice that something was published and what it says, with the link back;
 * the reporting itself stays on the page, where its sourcing, corrections and
 * structured data travel with it.
 */

import { PUBLISHER, SITE_NAME } from "@/lib/site";

export type FeedItem = {
  title: string;
  url: string;
  description: string | null;
  publishedAt: string;
  section: string | null;
  author: string | null;
  image: { url: string; width: number; height: number; alt: string | null } | null;
};

export type Feed = {
  title: string;
  description: string;
  siteUrl: string;
  selfUrl: string;
  language: string;
  imageUrl: string;
  items: FeedItem[];
};

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Characters XML 1.0 forbids outright; one stray control byte in a
    // headline would otherwise make the whole feed unparseable.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/**
 * The two people RSS asks a channel to name: the managing editor, answerable
 * for what the feed says, and the webmaster, for the feed itself. Every feed
 * is the paper's, so every feed names the same two, each written the way RSS
 * specifies, as an address followed by a name in brackets.
 */
function channelContacts(): string {
  const lines: string[] = [];
  if (PUBLISHER.editor.email) {
    const editor = `${PUBLISHER.editor.name || "Editor"}, ${SITE_NAME}`;
    lines.push(
      `    <managingEditor>${escapeXml(`${PUBLISHER.editor.email} (${editor})`)}</managingEditor>\n`,
    );
  }
  if (PUBLISHER.email) {
    lines.push(`    <webMaster>${escapeXml(`${PUBLISHER.email} (${SITE_NAME})`)}</webMaster>\n`);
  }
  return lines.join("");
}

/** RFC 822 dates, which RSS requires: "Sat, 26 Sep 2026 08:01:51 GMT". */
function rfc822(iso: string): string {
  return new Date(iso).toUTCString();
}

function renderItem(item: FeedItem): string {
  const parts = [
    `<title>${escapeXml(item.title)}</title>`,
    `<link>${escapeXml(item.url)}</link>`,
    `<guid isPermaLink="true">${escapeXml(item.url)}</guid>`,
    `<pubDate>${rfc822(item.publishedAt)}</pubDate>`,
  ];
  if (item.description) parts.push(`<description>${escapeXml(item.description)}</description>`);
  if (item.section) parts.push(`<category>${escapeXml(item.section)}</category>`);
  if (item.author) parts.push(`<dc:creator>${escapeXml(item.author)}</dc:creator>`);
  if (item.image) {
    parts.push(
      `<media:content url="${escapeXml(item.image.url)}" medium="image" type="image/jpeg" width="${item.image.width}" height="${item.image.height}">` +
        (item.image.alt ? `<media:description type="plain">${escapeXml(item.image.alt)}</media:description>` : "") +
        `</media:content>`,
    );
  }
  return `    <item>\n      ${parts.join("\n      ")}\n    </item>`;
}

export function renderRss(feed: Feed): string {
  const newest = feed.items[0]?.publishedAt;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(feed.title)}</title>
    <link>${escapeXml(feed.siteUrl)}</link>
    <description>${escapeXml(feed.description)}</description>
    <language>${escapeXml(feed.language)}</language>
${channelContacts()}    <atom:link href="${escapeXml(feed.selfUrl)}" rel="self" type="application/rss+xml" />
    <image>
      <url>${escapeXml(feed.imageUrl)}</url>
      <title>${escapeXml(feed.title)}</title>
      <link>${escapeXml(feed.siteUrl)}</link>
    </image>
${newest ? `    <lastBuildDate>${rfc822(newest)}</lastBuildDate>\n` : ""}    <ttl>5</ttl>
${feed.items.map(renderItem).join("\n")}
  </channel>
</rss>
`;
}

export const RSS_HEADERS = {
  "Content-Type": "application/rss+xml; charset=utf-8",
  "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
} as const;
