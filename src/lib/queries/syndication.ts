import "server-only";

import { createAnonymousClient } from "@/lib/supabase/anonymous";

/**
 * Reads for the machine-facing surfaces: feeds, sitemaps and llms.txt.
 *
 * These use the anonymous client rather than the per-request one. They must
 * show exactly what a logged-out reader sees, and a client that reads no
 * cookies lets the responses be cached and shared instead of rebuilt for
 * every crawler hit.
 */

/** A 'scheduled' row becomes public once its timestamp passes. */
const VISIBLE_STATUSES = ["published", "scheduled"] as const;

const FIELDS = `
  slug, headline, standfirst, summary, published_at, content_updated_at,
  hero_image_url, hero_image_alt,
  categories!inner ( slug, name ),
  authors ( slug, display_name )
`;

export type SyndicatedArticle = {
  slug: string;
  headline: string;
  standfirst: string | null;
  summary: string | null;
  published_at: string;
  content_updated_at: string | null;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  categories: { slug: string; name: string };
  authors: { slug: string; display_name: string } | null;
};

export function articlePath(article: { slug: string; categories: { slug: string } }): string {
  return `/${article.categories.slug}/${article.slug}`;
}

/**
 * When the story last changed in a way a reader would notice: its text, or
 * failing that its publication. Never the row's updated_at, which moves on
 * every page view.
 */
export function lastChanged(
  article: Pick<SyndicatedArticle, "published_at" | "content_updated_at">,
): string {
  const published = Date.parse(article.published_at);
  const changed = article.content_updated_at ? Date.parse(article.content_updated_at) : NaN;
  return !Number.isNaN(changed) && changed > published
    ? new Date(changed).toISOString()
    : new Date(published).toISOString();
}

/** The newest public stories, optionally from one section, newest first. */
export async function getLatestArticles({
  limit = 50,
  categorySlug,
  since,
}: {
  limit?: number;
  categorySlug?: string;
  since?: string;
} = {}): Promise<SyndicatedArticle[]> {
  const supabase = createAnonymousClient();
  let query = supabase
    .from("articles")
    .select(FIELDS)
    .in("status", VISIBLE_STATUSES)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(limit);

  if (categorySlug) query = query.eq("categories.slug", categorySlug);
  if (since) query = query.gte("published_at", since);

  const { data } = await query;
  return (data ?? []) as unknown as SyndicatedArticle[];
}

/**
 * The most rows the REST layer returns for one request. Anything that must see
 * every row pages through in steps of this size; asking for more in a single
 * request silently returns the first thousand.
 */
const PAGE_SIZE = 1000;

/** Fetches every row of a query by paging through it with Range requests. */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export type SitemapArticle = {
  slug: string;
  published_at: string;
  content_updated_at: string | null;
  hero_image_url: string | null;
  categories: { slug: string };
};

/** Every public story published in [start, end), oldest first. */
export async function getArticlesPublishedBetween(
  start: string,
  end: string,
): Promise<SitemapArticle[]> {
  const supabase = createAnonymousClient();
  const now = new Date().toISOString();

  const rows = await fetchAllPages((from, to) =>
    supabase
      .from("articles")
      .select("slug, published_at, content_updated_at, hero_image_url, categories!inner ( slug )")
      .in("status", VISIBLE_STATUSES)
      .gte("published_at", start)
      .lt("published_at", end)
      .lte("published_at", now)
      .order("published_at", { ascending: true })
      .order("slug", { ascending: true })
      .range(from, to),
  );
  return rows as unknown as SitemapArticle[];
}

/** First instant of the UTC month containing `date`, and of the one after. */
export function monthBounds(year: number, monthIndex: number) {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export type ArticleMonth = { key: string; lastChanged: string };

/**
 * Every UTC month with at least one public story, newest first, each with the
 * latest change inside it: the month sitemaps the index points at.
 *
 * Walks month by month from the first story to now, asking each month only
 * for its most recently changed row, so the cost grows with the paper's age in
 * months rather than with the number of stories.
 */
export async function getArticleMonths(): Promise<ArticleMonth[]> {
  const supabase = createAnonymousClient();
  const now = new Date();

  const { data: first } = await supabase
    .from("articles")
    .select("published_at")
    .in("status", VISIBLE_STATUSES)
    .lte("published_at", now.toISOString())
    .order("published_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!first?.published_at) return [];

  const origin = new Date(first.published_at);
  const firstMonth = origin.getUTCFullYear() * 12 + origin.getUTCMonth();
  const lastMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const months: { key: string; start: string; end: string }[] = [];
  for (let index = firstMonth; index <= lastMonth; index += 1) {
    const year = Math.floor(index / 12);
    const monthIndex = index % 12;
    const { start, end } = monthBounds(year, monthIndex);
    months.push({ key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`, start, end });
  }

  const results = await Promise.all(
    months.map(async (month) => {
      const { data } = await supabase
        .from("articles")
        .select("published_at, content_updated_at")
        .in("status", VISIBLE_STATUSES)
        .gte("published_at", month.start)
        .lt("published_at", month.end)
        .lte("published_at", now.toISOString())
        .order("content_updated_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      return data ? { key: month.key, lastChanged: lastChanged(data as SyndicatedArticle) } : null;
    }),
  );

  return results.filter((month): month is ArticleMonth => month !== null).reverse();
}

/**
 * The fewest public stories a topic page needs before it is offered to search
 * engines. Most tags are attached to a single story; a page listing one story
 * is a thinner copy of that story's own page, and a site full of them reads to
 * a search engine as a site full of thin pages. Below this a topic page still
 * works for readers but carries noindex and stays out of the sitemap.
 */
export const MIN_INDEXABLE_TOPIC_STORIES = 5;

export type TopicCount = { slug: string; name: string; stories: number; lastPublished: string };

/** Every active topic with its number of public stories, most first. */
export async function getTopicCounts(): Promise<TopicCount[]> {
  const supabase = createAnonymousClient();
  const now = new Date().toISOString();

  const rows = await fetchAllPages((from, to) =>
    supabase
      .from("article_tags")
      .select("article_id, tags!inner ( slug, name, is_active ), articles!inner ( status, published_at )")
      .eq("tags.is_active", true)
      .in("articles.status", VISIBLE_STATUSES)
      .lte("articles.published_at", now)
      .order("article_id", { ascending: true })
      .order("tag_id", { ascending: true })
      .range(from, to),
  );

  const counts = new Map<string, TopicCount>();
  for (const row of rows as unknown as {
    tags: { slug: string; name: string };
    articles: { published_at: string };
  }[]) {
    const current = counts.get(row.tags.slug);
    if (current) {
      current.stories += 1;
      if (row.articles.published_at > current.lastPublished) {
        current.lastPublished = row.articles.published_at;
      }
    } else {
      counts.set(row.tags.slug, {
        slug: row.tags.slug,
        name: row.tags.name,
        stories: 1,
        lastPublished: row.articles.published_at,
      });
    }
  }

  return [...counts.values()].sort((a, b) => b.stories - a.stories);
}

/** Active writers with at least one public story, and their latest story's date. */
export async function getPublishingAuthors(): Promise<{ slug: string; lastPublished: string }[]> {
  const supabase = createAnonymousClient();
  const now = new Date().toISOString();

  const rows = await fetchAllPages((from, to) =>
    supabase
      .from("articles")
      .select("id, published_at, authors!inner ( slug, is_active )")
      .eq("authors.is_active", true)
      .in("status", VISIBLE_STATUSES)
      .lte("published_at", now)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const latest = new Map<string, string>();
  for (const row of rows as unknown as { published_at: string; authors: { slug: string } }[]) {
    const seen = latest.get(row.authors.slug);
    if (!seen || row.published_at > seen) latest.set(row.authors.slug, row.published_at);
  }
  return [...latest].map(([slug, lastPublished]) => ({ slug, lastPublished }));
}

/** Live-coverage hubs that are public, with their last update. */
export async function getLiveCoverage() {
  const supabase = createAnonymousClient();
  const { data } = await supabase
    .from("news_events")
    .select("slug, updated_at")
    .in("status", ["developing", "concluded"])
    .lte("published_at", new Date().toISOString());
  return data ?? [];
}

/** An active section, or null. */
export async function getSection(slug: string) {
  const supabase = createAnonymousClient();
  const { data } = await supabase
    .from("categories")
    .select("slug, name, description")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

/** Every active section, in the editors' running order. */
export async function getSections() {
  const supabase = createAnonymousClient();
  const { data } = await supabase
    .from("categories")
    .select("slug, name, description, updated_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return data ?? [];
}
