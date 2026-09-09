import { XMLParser } from "fast-xml-parser";

/**
 * Google Trends daily search RSS.
 *
 * Public, unauthenticated, and updated continuously. Each item is a rising
 * search term plus the coverage Google has matched to it — headline, outlet and
 * link — which is what makes a trend usable as a brief rather than just a
 * keyword.
 *
 * Note on X/Twitter: its trends endpoint requires a paid API tier and returns
 * 401 without one, so it is not wired up here. Google Trends is arguably the
 * better signal for a news site regardless — it measures what people went
 * looking for, rather than what was posted at them.
 */

export type TrendNewsItem = {
  title: string;
  source: string;
  url: string;
  picture: string | null;
};

export type TrendingTerm = {
  term: string;
  approxTraffic: string | null;
  trafficRank: number | null;
  newsItems: TrendNewsItem[];
};

const parser = new XMLParser({
  ignoreAttributes: true,
  isArray: (name) => ["item", "ht:news_item"].includes(name),
  trimValues: true,
  // The feed uses namespaced ht: elements; keeping the prefix avoids collisions
  // with the ordinary RSS fields of the same name.
  removeNSPrefix: false,
});

function text(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const inner = (value as Record<string, unknown>)["#text"];
    if (typeof inner === "string") return inner.trim() || null;
  }
  return null;
}

/**
 * Turns Google's traffic band into a number.
 *
 * The feed reports '2000+' rather than an exact count, so this is the floor of
 * the band — enough to rank and threshold on, and honest about being
 * approximate.
 */
function parseTraffic(value: string | null): number | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseTrendsFeed(xml: string): TrendingTerm[] {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const rss = parsed.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const items = (channel?.item ?? []) as Record<string, unknown>[];

  const terms: TrendingTerm[] = [];

  for (const item of items) {
    const term = text(item.title);
    if (!term) continue;

    const approxTraffic = text(item["ht:approx_traffic"]);
    const rawNews = (item["ht:news_item"] ?? []) as Record<string, unknown>[];

    const newsItems: TrendNewsItem[] = [];
    for (const entry of rawNews) {
      const title = text(entry["ht:news_item_title"]);
      const url = text(entry["ht:news_item_url"]);
      if (!title || !url) continue;

      newsItems.push({
        title,
        source: text(entry["ht:news_item_source"]) ?? "Unknown",
        url,
        picture: text(entry["ht:news_item_picture"]),
      });
    }

    terms.push({
      term,
      approxTraffic,
      trafficRank: parseTraffic(approxTraffic),
      newsItems,
    });
  }

  return terms;
}

export async function fetchTrends(region: string): Promise<TrendingTerm[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(
      `https://trends.google.com/trending/rss?geo=${encodeURIComponent(region)}`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "TheFederalPostTrendsBot/1.0 (+https://newswebsite-pi.vercel.app)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) throw new Error(`Trends responded ${response.status}`);
    return parseTrendsFeed(await response.text());
  } finally {
    clearTimeout(timeout);
  }
}
