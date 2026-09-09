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
`;

const AUTHOR_JOINED_FIELDS = CARD_FIELDS.replace("authors (", "authors!inner (");

/** A 'scheduled' row becomes public once its timestamp passes; see the articles migration. */
const VISIBLE_STATUSES = ["published", "scheduled"] as const;

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

function nowIso() {
  return new Date().toISOString();
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
  const { data, error } = await supabase
    .from("articles")
    .select(CARD_FIELDS)
    .in("status", VISIBLE_STATUSES)
    .lte("published_at", nowIso())
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as ArticleCardData[];
}

/** Live editor pins, in slot order. */
export async function getLivePlacements() {
  const supabase = await createClient();
  const now = nowIso();

  const { data, error } = await supabase
    .from("homepage_placements")
    .select("zone, position, article_id, category_id")
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("position", { ascending: true });

  if (error) return [];
  return data ?? [];
}

export async function getArticlesByCategory(
  slug: string,
  limit = 30,
): Promise<ArticleCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articles")
    .select(CARD_FIELDS)
    .eq("categories.slug", slug)
    .in("status", VISIBLE_STATUSES)
    .lte("published_at", nowIso())
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as ArticleCardData[];
}

export async function getArticlesByAuthor(
  slug: string,
  limit = 30,
): Promise<ArticleCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articles")
    .select(AUTHOR_JOINED_FIELDS)
    .eq("authors.slug", slug)
    .in("status", VISIBLE_STATUSES)
    .lte("published_at", nowIso())
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

  const { data, error } = await supabase
    .from("articles")
    .select(CARD_FIELDS)
    .in("id", ids)
    .in("status", VISIBLE_STATUSES)
    .lte("published_at", nowIso())
    .order("published_at", { ascending: false });

  return {
    tag,
    articles: error ? [] : ((data ?? []) as unknown as ArticleCardData[]),
  };
}

/** Full-text search over the weighted search_vector column. */
export async function searchArticles(
  query: string,
  limit = 30,
): Promise<ArticleCardData[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articles")
    .select(CARD_FIELDS)
    // websearch syntax lets a reader use quotes and OR the way they would in
    // any search box, instead of learning tsquery operators.
    .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
    .in("status", VISIBLE_STATUSES)
    .lte("published_at", nowIso())
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as ArticleCardData[];
}
