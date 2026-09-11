import "server-only";

import { XMLParser } from "fast-xml-parser";

import type { IncomingMention } from "../cluster";
import { outletKey } from "./search-and-news";

/**
 * Google News top stories, per home region.
 *
 * Measured before it was added: three regional feeds of forty items, a
 * quarter of them new every five minutes, between eighteen and twenty-nine
 * distinct outlets per feed, and one to four soft items in forty. It is the
 * cheapest cross-outlet signal there is — Google has already done the work of
 * noticing that many papers are carrying a story — and a story on it arrives
 * with the outlet's identity attached, which is what corroboration counts.
 *
 * Links are Google redirects; the writer resolves them when it needs the
 * text. The outlet comes from the feed's source tag.
 */

const REGIONS = ["IN", "US", "GB"];
const UA = "TheFederalPostBot/1.0 (+https://newswebsite-pi.vercel.app)";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "item",
  trimValues: true,
});

function text(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "object") {
    const inner = (value as Record<string, unknown>)["#text"];
    if (typeof inner === "string") return inner.trim() || null;
  }
  return null;
}

export async function fetchGoogleTopStories(): Promise<IncomingMention[]> {
  const mentions: IncomingMention[] = [];

  for (const region of REGIONS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`https://news.google.com/rss?hl=en-${region}&gl=${region}&ceid=${region}:en`, {
        signal: controller.signal,
        headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" },
        cache: "no-store",
      });
      if (!response.ok) continue;

      const parsed = parser.parse(await response.text()) as Record<string, unknown>;
      const channel = (parsed.rss as Record<string, unknown> | undefined)?.channel as
        | Record<string, unknown>
        | undefined;
      const items = (channel?.item ?? []) as Record<string, unknown>[];

      items.slice(0, 40).forEach((item, index) => {
        const rawTitle = text(item.title);
        const link = text(item.link);
        if (!rawTitle || !link) return;

        const source = text(item.source);
        const sourceUrl =
          item.source && typeof item.source === "object"
            ? text((item.source as Record<string, unknown>)["@_url"])
            : null;
        const title =
          source && rawTitle.endsWith(` - ${source}`)
            ? rawTitle.slice(0, -(source.length + 3)).trim()
            : rawTitle;
        const pubDate = text(item.pubDate);
        const published = pubDate ? new Date(pubDate) : null;

        mentions.push({
          sourceKind: "gnews",
          sourceKey: outletKey(source, sourceUrl),
          externalId: `gtop:${link}`,
          title,
          url: link,
          region,
          observedAt:
            published && !Number.isNaN(published.getTime()) ? published.toISOString() : undefined,
          raw: { source, sourceUrl, topStories: region, position: index + 1 },
        });
      });
    } catch {
      // One region failing costs that region's front page, nothing more.
    } finally {
      clearTimeout(timeout);
    }
  }

  return mentions;
}
