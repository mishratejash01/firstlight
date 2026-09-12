import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTrends } from "@/lib/trends/google-trends";
import { searchGoogleNews } from "@/lib/trends/google-news";
import type { IncomingMention } from "../cluster";
import { hostOfUrl } from "../hosts";

/**
 * The sources the previous engine ran on, re-expressed as mention streams.
 *
 * A Google Trends term becomes a mention, and so does each headline Google
 * matched to it — as separate mentions from their own outlets. That matters:
 * the old engine stored the headlines as an attribute of the term, so a story
 * three outlets covered under two different search terms was two candidates
 * with three headlines each. Here it is one event with six mentions from four
 * sources, which is what it actually is.
 */

function hostOf(url: string): string {
  return hostOfUrl(url) ?? "unknown";
}

/** A stable key for an outlet: its host where the feed gives one, else its name. */
export function outletKey(name: string | null | undefined, siteUrl: string | null | undefined): string {
  if (siteUrl) {
    const host = hostOf(siteUrl);
    if (host !== "unknown") return host;
  }
  const slug = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `outlet:${slug}` : "unknown";
}

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T) ?? fallback;
}

export async function fetchTrendMentions(): Promise<IncomingMention[]> {
  const regions = await readSetting<string[]>("trending_regions", ["IN"]);
  const dayKey = new Date().toISOString().slice(0, 10);
  const mentions: IncomingMention[] = [];

  for (const region of regions) {
    let terms;
    try {
      terms = await fetchTrends(region);
    } catch {
      continue;
    }

    for (const term of terms) {
      mentions.push({
        sourceKind: "trends",
        sourceKey: `trends:${region}`,
        externalId: `trends:${region}:${dayKey}:${term.term.toLowerCase()}`,
        title: term.term,
        region,
        magnitude: term.trafficRank,
        raw: { approxTraffic: term.approxTraffic },
      });

      for (const item of term.newsItems) {
        mentions.push({
          sourceKind: "gnews",
          sourceKey: hostOf(item.url),
          externalId: `gnews:${item.url}`,
          title: item.title,
          url: item.url,
          region,
          raw: { source: item.source, viaTrend: term.term },
        });
      }
    }
  }

  return mentions;
}

/**
 * Widens coverage of events that already look significant.
 *
 * Not run for everything: a Google News search per candidate every minute
 * would be thousands of requests. The caller passes the events worth
 * corroborating — typically the top of the score table — and this returns
 * what the wider press is saying about each.
 */
export async function fetchCorroborationFor(
  events: { id: string; title: string; entities: string[] }[],
  region = "IN",
): Promise<IncomingMention[]> {
  const mentions: IncomingMention[] = [];

  for (const event of events) {
    // Entities make a better query than a headline, which is written to be read
    // rather than searched. Fall back to the title when there are none.
    const query = event.entities.length
      ? event.entities.slice(0, 3).map((key) => key.replace(/-/g, " ")).join(" ")
      : event.title;

    const hits = await searchGoogleNews(query, region);
    for (const hit of hits.slice(0, 12)) {
      mentions.push({
        sourceKind: "gnews",
        // The link is a Google redirect, so the outlet has to come from the
        // feed's source tag. Keyed by the outlet's own host, every hit from a
        // different paper is a different source, which is the whole point.
        sourceKey: outletKey(hit.source, hit.sourceUrl),
        externalId: `gnews:${hit.url}`,
        title: hit.title,
        url: hit.url,
        region,
        observedAt: hit.publishedAt ?? undefined,
        raw: { source: hit.source, sourceUrl: hit.sourceUrl, corroboratingEvent: event.id },
      });
    }
  }

  return mentions;
}

/**
 * Wire feeds that are themselves beat coverage. An item from TechCrunch's
 * AI feed is AI news whether or not a search also found it, and should get
 * the beat's priority and threshold.
 */
const BEAT_FEEDS: Record<string, string> = {
  "techcrunch-ai": "ai",
  "the-verge-ai": "ai",
  "mit-technology-review-ai": "ai",
  "wired-ai": "ai",
  "openai-news": "ai",
  "deepmind-blog": "ai",
  "hugging-face-blog": "ai",
  "techcrunch-startups": "startups",
};

/**
 * Wire items the engine has not read yet, as mentions.
 *
 * The database answers "which items have no mention" directly
 * (engine_unread_wire_items), rather than this side taking the newest few
 * hundred and letting the unique key discard repeats — that starved older
 * items whenever a burst arrived. The same function applies both feed
 * switches, so a feed switched off stops entering the engine at the next
 * pulse even if the poller fetched from it a minute earlier: "off" means off
 * within a minute, not five.
 */
export async function fetchWireMentions(): Promise<IncomingMention[]> {
  const supabase = createAdminClient();

  const { data } = await supabase.rpc("engine_unread_wire_items", { p_limit: 300 });

  return (data ?? []).map((item) => ({
    sourceKind: "rss",
    sourceKey: item.source_homepage_url ? hostOf(item.source_homepage_url) : item.source_slug,
    externalId: `wire:${item.id}`,
    title: item.title,
    body: item.summary,
    url: item.link,
    observedAt: item.published_at ?? item.ingested_at,
    raw: {
      wireItemId: item.id,
      ...(BEAT_FEEDS[item.source_slug] ? { beat: BEAT_FEEDS[item.source_slug] } : {}),
    },
  }));
}
