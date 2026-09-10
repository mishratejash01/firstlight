import "server-only";

import type { IncomingMention } from "../cluster";

/**
 * Wikipedia as a breaking-news sensor.
 *
 * The most valuable property of this stream is that it is independent of the
 * media. When something happens, people go to Wikipedia to find out what it
 * is, and editors race to update the page — before, and regardless of, what
 * newsrooms decide to cover. Osborne et al. (2012) showed pageview and edit
 * spikes track real events closely; this uses both.
 *
 * Two signals:
 *   views  — yesterday's most-viewed articles, less the permanent furniture
 *            (the main page, featured pictures, the day's Google Doodle)
 *   edits  — pages receiving an unusual burst of edits in the last hour,
 *            which is the faster of the two
 *
 * Page titles are handed to the clusterer as entity names directly. A
 * Wikipedia title is about as clean an entity key as exists.
 */

const UA = "TheFederalPostBot/1.0 (+https://newswebsite-pi.vercel.app)";

/** Pages that are always in the top list and never news. */
const FURNITURE = new Set([
  "Main_Page",
  "Special:Search",
  "Wikipedia:Featured_pictures",
  "Portal:Current_events",
  "Wikipedia:About",
  "Wikipedia:Contents",
]);

function isFurniture(title: string): boolean {
  return (
    FURNITURE.has(title) ||
    title.startsWith("Special:") ||
    title.startsWith("Wikipedia:") ||
    title.startsWith("Portal:") ||
    title.startsWith("File:") ||
    title.startsWith("Template:") ||
    title.startsWith("Category:") ||
    title.startsWith("Help:") ||
    title.startsWith("Talk:") ||
    /^\d{4}$/.test(title) ||
    title.startsWith("Deaths_in_") ||
    title.startsWith("List_of_")
  );
}

async function getJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
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

function titleToText(title: string): string {
  return title.replace(/_/g, " ");
}

/**
 * Yesterday's most-viewed articles. The pageviews API publishes a day at a
 * time, with a lag of a few hours, so "yesterday" is the freshest complete day.
 */
export async function fetchWikipediaTopViews(): Promise<IncomingMention[]> {
  const day = new Date(Date.now() - 24 * 3600_000);
  const path = `${day.getUTCFullYear()}/${String(day.getUTCMonth() + 1).padStart(2, "0")}/${String(day.getUTCDate()).padStart(2, "0")}`;

  const data = await getJson<{
    items?: { articles: { article: string; views: number; rank: number }[] }[];
  }>(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${path}`);

  const articles = data?.items?.[0]?.articles ?? [];

  return articles
    .filter((entry) => !isFurniture(entry.article))
    .slice(0, 40)
    .map((entry) => ({
      sourceKind: "wikipedia_views",
      sourceKey: "en.wikipedia.org",
      externalId: `wp-views:${path}:${entry.article}`,
      title: titleToText(entry.article),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(entry.article)}`,
      entityNames: [titleToText(entry.article)],
      magnitude: entry.views,
      raw: { rank: entry.rank, views: entry.views, day: path },
    }));
}

/**
 * Pages with an edit burst in the last hour.
 *
 * Recent changes is a firehose; what matters is concentration. A page edited
 * eight times by five people in an hour is a page where something is
 * happening. Bots are excluded — they edit constantly and mean nothing.
 */
export async function fetchWikipediaEditBursts(): Promise<IncomingMention[]> {
  const since = new Date(Date.now() - 60 * 60_000).toISOString();

  const data = await getJson<{
    query?: {
      recentchanges: { title: string; user: string; timestamp: string; ns: number }[];
    };
  }>(
    "https://en.wikipedia.org/w/api.php?action=query&list=recentchanges" +
      "&rcnamespace=0&rctype=edit&rcshow=!bot&rcprop=title|user|timestamp" +
      `&rclimit=500&rcend=${encodeURIComponent(since)}&format=json`,
  );

  const changes = data?.query?.recentchanges ?? [];

  const byPage = new Map<string, { edits: number; editors: Set<string> }>();
  for (const change of changes) {
    if (isFurniture(change.title.replace(/ /g, "_"))) continue;
    const entry = byPage.get(change.title) ?? { edits: 0, editors: new Set<string>() };
    entry.edits += 1;
    entry.editors.add(change.user);
    byPage.set(change.title, entry);
  }

  const hourKey = new Date().toISOString().slice(0, 13);

  return [...byPage.entries()]
    // Several distinct editors is the signal. One person making twenty edits is
    // a copy-edit session.
    .filter(([, stats]) => stats.edits >= 6 && stats.editors.size >= 3)
    .sort((a, b) => b[1].edits - a[1].edits)
    .slice(0, 20)
    .map(([title, stats]) => ({
      sourceKind: "wikipedia_edits",
      sourceKey: "en.wikipedia.org",
      externalId: `wp-edits:${hourKey}:${title}`,
      title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      entityNames: [title],
      magnitude: stats.edits,
      raw: { edits: stats.edits, editors: stats.editors.size, hour: hourKey },
    }));
}
