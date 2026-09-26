import "server-only";

import { CRAWLER_USER_AGENT } from "@/lib/site";

import type { IncomingMention } from "../cluster";

/**
 * Social streams that are free and need no key.
 *
 * Bluesky's trending topics are the closest free substitute for X's trends
 * endpoint (which is paid), and on inspection they are better behaved: the
 * topics are short natural-language phrases about actual events rather than
 * hashtags. Mastodon's trending tags are the opposite — mostly hashtag games —
 * and are included at low weight purely as a corroboration signal.
 */

const UA = CRAWLER_USER_AGENT;

async function getJson<T>(url: string, timeoutMs = 15_000): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Stable id for a topic within a day, so a topic trending all day is one mention. */
function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function fetchBlueskyTrending(): Promise<IncomingMention[]> {
  const data = await getJson<{
    topics?: { topic: string; link?: string }[];
  }>("https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrendingTopics?limit=25");

  return (data?.topics ?? []).map((item, index) => ({
    sourceKind: "bluesky",
    sourceKey: "bsky:trending",
    externalId: `bsky:${dayKey()}:${item.topic.toLowerCase()}`,
    title: item.topic,
    url: item.link ? `https://bsky.app${item.link}` : null,
    region: "US",
    // Position is the only intensity Bluesky exposes; inverted so first = 25.
    magnitude: 25 - index,
    raw: item as unknown as Record<string, unknown>,
  }));
}

export async function fetchMastodonTrending(): Promise<IncomingMention[]> {
  const data = await getJson<
    { name: string; url: string; history: { uses: string; accounts: string }[] }[]
  >("https://mastodon.social/api/v1/trends/tags?limit=20");

  return (data ?? [])
    .map((tag) => {
      const uses = Number(tag.history?.[0]?.uses ?? 0);
      return {
        sourceKind: "mastodon",
        sourceKey: "mastodon.social",
        externalId: `mastodon:${dayKey()}:${tag.name.toLowerCase()}`,
        // Hashtags run words together; split camelCase so the embedding and
        // entity extractor see "International Sandwich" not one token.
        title: tag.name.replace(/([a-z])([A-Z])/g, "$1 $2"),
        url: tag.url,
        region: null,
        magnitude: uses,
        raw: { uses, accounts: tag.history?.[0]?.accounts },
      } satisfies IncomingMention;
    })
    // Below a few hundred uses a Mastodon tag is a conversation, not a trend.
    .filter((mention) => (mention.magnitude ?? 0) >= 100);
}

export async function fetchHackerNews(): Promise<IncomingMention[]> {
  const data = await getJson<{
    hits?: { objectID: string; title: string; url?: string; points: number; num_comments: number }[];
  }>("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30");

  return (data?.hits ?? [])
    .filter((hit) => hit.title && hit.points >= 100)
    .map((hit) => ({
      sourceKind: "hn",
      sourceKey: "news.ycombinator.com",
      externalId: `hn:${hit.objectID}`,
      title: hit.title,
      url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      region: "US",
      magnitude: hit.points,
      raw: { points: hit.points, comments: hit.num_comments },
    }));
}
