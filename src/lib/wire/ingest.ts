import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { parseFeed, type ParsedFeedItem } from "./parse-feed";

/**
 * Wire feed ingestion.
 *
 * Runs as the service role because it belongs to no user — it is a scheduled
 * worker, not somebody's session. That is also why `wire_items` has no INSERT
 * policy for any signed-in role: staging rows can only arrive through this
 * path, so nothing that reaches an editor's queue can have been posted by hand
 * and made to look like it came off a licensed feed.
 *
 * Ingested items never touch `articles`. An editor promotes an item, and that
 * act is what creates the article.
 */

export type IngestReport = {
  sourceSlug: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  error?: string;
};

/** Feeds are third-party endpoints; one that hangs must not hang the worker. */
const FETCH_TIMEOUT_MS = 15_000;
const MAX_ITEMS_PER_RUN = 60;

async function fetchFeed(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Identify ourselves. Publishers block anonymous scrapers, and rightly.
        "User-Agent": "TheFederalPostWireBot/1.0 (+https://newswebsite-pi.vercel.app)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Feed responded ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Routes an item to a section using the feed's own subject codes.
 *
 * Matching on IPTC qcode first is the reason the taxonomy is IPTC-based at all:
 * a feed that emits medtop codes lands in the right section without anybody
 * guessing from the headline. Label matching is the fallback for feeds that
 * only emit free text.
 */
function matchCategory(
  itemCategories: string[],
  categories: { id: string; slug: string; name: string; iptc_qcode: string | null }[],
): string | null {
  const lowered = itemCategories.map((value) => value.toLowerCase().trim());

  for (const category of categories) {
    if (category.iptc_qcode && lowered.includes(category.iptc_qcode.toLowerCase())) {
      return category.id;
    }
  }

  for (const category of categories) {
    if (lowered.includes(category.name.toLowerCase()) || lowered.includes(category.slug)) {
      return category.id;
    }
  }

  return null;
}

async function ingestSource(
  source: { id: string; slug: string; name: string },
  feedUrl: string,
  categories: { id: string; slug: string; name: string; iptc_qcode: string | null }[],
): Promise<IngestReport> {
  const supabase = createAdminClient();
  const report: IngestReport = {
    sourceSlug: source.slug,
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
  };

  let items: ParsedFeedItem[];
  try {
    items = parseFeed(await fetchFeed(feedUrl)).slice(0, MAX_ITEMS_PER_RUN);
  } catch (error) {
    report.error = error instanceof Error ? error.message : "Feed fetch failed";

    // Record the failure against the source so a feed that has quietly died is
    // visible in the admin UI rather than only in a log nobody reads.
    await supabase
      .from("source_licences")
      .update({ last_ingest_error: report.error })
      .eq("source_id", source.id);

    return report;
  }

  report.fetched = items.length;

  const externalIds = items.map((item) => item.externalId);
  const { data: existingRows } = await supabase
    .from("wire_items")
    .select("id, external_id, content_hash, status")
    .eq("source_id", source.id)
    .in("external_id", externalIds);

  const existing = new Map(
    (existingRows ?? []).map((row) => [row.external_id, row]),
  );

  for (const item of items) {
    const prior = existing.get(item.externalId);

    // Same id, same content: the feed is simply repeating itself.
    if (prior && prior.content_hash === item.contentHash) {
      report.skipped += 1;
      continue;
    }

    const payload = {
      source_id: source.id,
      external_id: item.externalId,
      content_hash: item.contentHash,
      title: item.title,
      summary: item.summary,
      body: item.body,
      link: item.link,
      author_name: item.authorName,
      published_at: item.publishedAt,
      raw_categories: item.categories,
      suggested_category_id: matchCategory(item.categories, categories),
      raw_payload: item.raw as never,
    };

    if (prior) {
      // The content changed upstream. Only refresh items nobody has acted on:
      // silently rewriting a story an editor already promoted or rejected would
      // undo their decision.
      if (prior.status !== "pending") {
        report.skipped += 1;
        continue;
      }
      await supabase.from("wire_items").update(payload).eq("id", prior.id);
      report.updated += 1;
    } else {
      await supabase.from("wire_items").insert(payload);
      report.inserted += 1;
    }
  }

  await supabase
    .from("source_licences")
    .update({ last_ingested_at: new Date().toISOString(), last_ingest_error: null })
    .eq("source_id", source.id);

  return report;
}

/** How many feeds are fetched at once. Different publishers, so parallel is
 * polite enough; the cap keeps the worst case inside the route's time limit. */
const CONCURRENCY = 6;

/**
 * Polls every wire source that is switched on.
 *
 * Two switches govern a feed. Its own is_active flag, and — for feeds in the
 * expanded wave — the engine_expanded_feeds_enabled setting, which stops the
 * whole wave at once. The founding feeds carry expanded = false and answer
 * only to their own flag.
 */
export async function ingestAllWireSources(): Promise<IngestReport[]> {
  const supabase = createAdminClient();

  const [{ data: licences }, { data: setting }] = await Promise.all([
    supabase
      .from("source_licences")
      .select("feed_url, sources!inner ( id, slug, name, origin, is_active, expanded )")
      .not("feed_url", "is", null),
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", "engine_expanded_feeds_enabled")
      .maybeSingle(),
  ]);
  const expandedEnabled = setting?.value === true;

  const active = (licences ?? []).filter((row) => {
    const source = row.sources as unknown as {
      origin: string;
      is_active: boolean;
      expanded: boolean;
    };
    if (!source?.is_active || source.origin !== "wire") return false;
    return !source.expanded || expandedEnabled;
  });

  if (!active.length) return [];

  const { data: categories } = await supabase
    .from("categories")
    .select("id, slug, name, iptc_qcode")
    .eq("is_active", true);

  const reports: IngestReport[] = [];

  for (let i = 0; i < active.length; i += CONCURRENCY) {
    const batch = active.slice(i, i + CONCURRENCY).map((row) => {
      const source = row.sources as unknown as {
        id: string;
        slug: string;
        name: string;
      };
      return ingestSource(source, row.feed_url as string, categories ?? []);
    });
    reports.push(...(await Promise.all(batch)));
  }

  return reports;
}
