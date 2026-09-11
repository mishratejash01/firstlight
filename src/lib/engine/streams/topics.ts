import "server-only";

import { searchGoogleNews } from "@/lib/trends/google-news";
import type { IncomingMention } from "../cluster";
import { outletKey } from "./search-and-news";

/**
 * Standing searches for beats the general streams under-serve.
 *
 * Artificial intelligence moves through lab announcements, research papers,
 * safety warnings and the public statements of a handful of people; startup
 * news through funding rounds and founders. Neither reliably reaches the
 * front page of a general outlet, so the engine asks Google News for each
 * beat directly, every slow pulse. Each hit is a mention keyed by its outlet,
 * so several papers on one story corroborate it exactly as they would
 * anywhere else.
 */

const BEATS: { beat: string; query: string; region: string }[] = [
  {
    beat: "ai",
    query: '"artificial intelligence" OR OpenAI OR Anthropic OR DeepMind OR "AI model" when:1d',
    region: "US",
  },
  {
    beat: "ai",
    query: '"AI safety" OR "AI regulation" OR AGI OR superintelligence OR "AI researchers" when:1d',
    region: "US",
  },
  {
    beat: "ai",
    query: 'Altman OR Musk OR Amodei OR Hassabis OR Huang OR Zuckerberg AI when:1d',
    region: "US",
  },
  {
    beat: "ai",
    query: '"artificial intelligence" OR "AI startup" India when:1d',
    region: "IN",
  },
  {
    beat: "startups",
    query: 'startup raises OR "Series A" OR "Series B" OR "Series C" OR unicorn OR "seed round" when:1d',
    region: "US",
  },
  {
    beat: "startups",
    query: 'startup funding OR "raises" OR unicorn OR "Y Combinator" India when:1d',
    region: "IN",
  },
];

export async function fetchBeatSearches(): Promise<IncomingMention[]> {
  const mentions: IncomingMention[] = [];

  for (const { beat, query, region } of BEATS) {
    let hits;
    try {
      hits = await searchGoogleNews(query, region);
    } catch {
      continue;
    }
    for (const hit of hits.slice(0, 20)) {
      mentions.push({
        sourceKind: "gnews",
        sourceKey: outletKey(hit.source, hit.sourceUrl),
        externalId: `gnews:${hit.url}`,
        title: hit.title,
        url: hit.url,
        region,
        observedAt: hit.publishedAt ?? undefined,
        raw: { source: hit.source, sourceUrl: hit.sourceUrl, beat },
      });
    }
  }

  return mentions;
}
