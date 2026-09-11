import { XMLParser } from "fast-xml-parser";

/**
 * Google News RSS, used as a corroboration source.
 *
 * Google Trends tells us what people are searching for. It does not tell us
 * whether anyone is actually reporting it, or who. This does: a query against
 * Google News returns the outlets currently covering a subject, which is what
 * turns "a lot of people typed this" into "a lot of people typed this and
 * Reuters, the BBC and the Hindu are all on it".
 *
 * That distinction is most of the difference between a news desk and a
 * trending-topics widget.
 */

export type NewsHit = {
  title: string;
  source: string;
  /** The outlet's own site, from the feed's <source url="…"> attribute. */
  sourceUrl: string | null;
  url: string;
  publishedAt: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "item",
  trimValues: true,
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
 * Google News titles arrive as "Headline - Outlet Name". The trailing outlet is
 * duplicated in the <source> element, so it is stripped from the headline
 * rather than left to appear twice in the prompt.
 */
function splitTitle(raw: string, source: string | null): string {
  if (!source) return raw;
  const suffix = ` - ${source}`;
  return raw.endsWith(suffix) ? raw.slice(0, -suffix.length).trim() : raw;
}

export async function searchGoogleNews(
  query: string,
  region = "IN",
  language = "en",
): Promise<NewsHit[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
    `&hl=${language}-${region}&gl=${region}&ceid=${region}:${language}`;

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "TheFederalPostBot/1.0 (+https://newswebsite-pi.vercel.app)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      cache: "no-store",
    });

    if (!response.ok) return [];

    const parsed = parser.parse(await response.text()) as Record<string, unknown>;
    const rss = parsed.rss as Record<string, unknown> | undefined;
    const channel = rss?.channel as Record<string, unknown> | undefined;
    const items = (channel?.item ?? []) as Record<string, unknown>[];

    const hits: NewsHit[] = [];
    for (const item of items.slice(0, 20)) {
      const rawTitle = text(item.title);
      const link = text(item.link);
      if (!rawTitle || !link) continue;

      const source = text(item.source);
      const sourceUrl =
        item.source && typeof item.source === "object"
          ? text((item.source as Record<string, unknown>)["@_url"])
          : null;
      const pubDate = text(item.pubDate);
      const published = pubDate ? new Date(pubDate) : null;

      hits.push({
        title: splitTitle(rawTitle, source),
        source: source ?? "Unknown",
        sourceUrl,
        url: link,
        publishedAt:
          published && !Number.isNaN(published.getTime())
            ? published.toISOString()
            : null,
      });
    }

    return hits;
  } catch {
    // Corroboration is an enhancement. A failure here should cost the candidate
    // its bonus, not remove it from consideration.
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
