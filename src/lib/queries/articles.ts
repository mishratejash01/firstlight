import { createClient } from "@/lib/supabase/server";

/**
 * Shared read queries for published articles.
 *
 * Every function here is scoped to what a reader may see. That scoping is
 * belt-and-braces: RLS already refuses unpublished rows to anonymous callers.
 * Repeating it in the query keeps the intent legible at the call site and means
 * a signed-in editor browsing the public site sees the public site, not their
 * own drafts leaking into the front page.
 */

const CARD_FIELDS = `
  id, slug, headline, standfirst, summary, hero_image_url, hero_image_alt,
  published_at, is_breaking, origin, attribution_url, attribution_label,
  categories!inner ( slug, name ),
  authors ( slug, display_name )
` as const;

export type ArticleCardData = {
  id: string;
  slug: string;
  headline: string;
  standfirst: string | null;
  summary: string | null;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  published_at: string | null;
  is_breaking: boolean;
  origin: "wire" | "original" | "curated";
  attribution_url: string | null;
  attribution_label: string | null;
  categories: { slug: string; name: string };
  authors: { slug: string; display_name: string } | null;
};

/** The public visibility rule, in one place. */
function onlyPublished<T extends { gte: (c: string, v: string) => T; in: (c: string, v: string[]) => T; lte: (c: string, v: string) => T }>(
  query: T,
): T {
  return query
    .in("status", ["published", "scheduled"])
    .lte("published_at", new Date().toISOString());
}

/**
 * One query for the whole front page.
 *
 * Fetching a single recent slice and composing hero, rail and shelves from it
 * in memory beats one query per section: a front page with fifteen sections
 * would otherwise mean sixteen round trips to Sydney before the first byte.
 */
export async function getRecentArticles(limit = 90): Promise<ArticleCardData[]> {
  const supabase = await createClient();
  const { data, error } = await onlyPublished(
    supabase.from("articles").select(CARD_FIELDS) as never,
  )
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as ArticleCardData[];
}

/** Live editor pins, newest window first. */
export async function getLivePlacements() {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("homepage_placements")
    .select("zone, position, article_id, category_id")
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("position", { ascending: true });

  if (error) return [];
  return data ?? [];
}

export async function getArticlesByCategory(slug: string, limit = 30) {
  const supabase = await createClient();
  const { data, error } = await onlyPublished(
    supabase.from("articles").select(CARD_FIELDS).eq("categories.slug", slug) as never,
  )
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as ArticleCardData[];
}

export async function getArticlesByAuthor(slug: string, limit = 30) {
  const supabase = await createClient();
  const { data, error } = await onlyPublished(
    supabase
      .from("articles")
      .select(`${CARD_FIELDS.replace("authors (", "authors!inner (")}`)
      .eq("authors.slug", slug) as never,
  )
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as ArticleCardData[];
}

export async function getArticlesByTag(slug: string, limit = 30) {
  const supabase = await createClient();

  // Resolve the tag first: filtering across a join table in one PostgREST call
  // reads far worse than two obvious queries, and the tag lookup is indexed.
  const { data: tag } = await supabase
    .from("tags")
    .select("id, name, slug, description")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!tag) return { tag: null, articles: [] as ArticleCardData[] };

  const { data: links } = await supabase
    .from("article_tags")
    .select("article_id")
    .eq("tag_id", tag.id)
    .limit(limit);

  const ids = (links ?? []).map((l) => l.article_id);
  if (!ids.length) return { tag, articles: [] as ArticleCardData[] };

  const { data, error } = await onlyPublished(
    supabase.from("articles").select(CARD_FIELDS).in("id", ids) as never,
  ).order("published_at", { ascending: false });

  return {
    tag,
    articles: error ? [] : ((data ?? []) as unknown as ArticleCardData[]),
  };
}

/** Full-text search over the weighted search_vector column. */
export async function searchArticles(query: string, limit = 30) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const { data, error } = await onlyPublished(
    supabase
      .from("articles")
      .select(CARD_FIELDS)
      // websearch syntax lets a reader use quotes and OR the way they would in
      // any search box, instead of learning tsquery operators.
      .textSearch("search_vector", trimmed, {
        type: "websearch",
        config: "english",
      }) as never,
  )
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as ArticleCardData[];
}
