import { createAnonymousClient } from "@/lib/supabase/anonymous";

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
  authors ( slug, display_name, title, avatar_url )
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
  authors: {
    slug: string;
    display_name: string;
    title: string | null;
    avatar_url: string | null;
  } | null;
};

/**
 * A breaking story, carrying the running order of its section.
 *
 * Only this query asks for `sort_order`, so only this type has it. The column
 * is the editors' own ranking of the sections — Politics at 10, Weather at 240
 * — which makes it the paper's existing answer to "which desk matters most",
 * and the right thing to rank breaking coverage by rather than inventing a
 * second list of important categories in a file somewhere.
 */
export type RankedArticle = Omit<ArticleCardData, "categories"> & {
  categories: { slug: string; name: string; sort_order: number };
};

const BREAKING_FIELDS = CARD_FIELDS.replace(
  "categories!inner ( slug, name )",
  "categories!inner ( slug, name, sort_order )",
);

function nowIso() {
  return new Date().toISOString();
}

/**
 * How long a story stays in the breaking banner after it goes live.
 *
 * The flag itself is cleared by the database once a story is older than this
 * (the expire-breaking job), so cards and story pages stop calling it breaking
 * at the same moment. The banner also asks for nothing older, so it never
 * carries a stale alert in the minutes before that job next runs.
 */
export const BREAKING_BANNER_HOURS = 6;

/**
 * Everything flagged as breaking, newest first: by an editor, or by the
 * desk for a story triaged as breaking within three hours of first sighting.
 *
 * Queried directly rather than filtered out of the front page's recent slice.
 * A story flagged breaking is not necessarily among the ninety most recent —
 * a quiet news day pushes it past the window and the strip would go dark while
 * the flag was still set.
 */
export async function getBreakingArticles(
  limit = 60,
  withinHours?: number,
): Promise<RankedArticle[]> {
  const supabase = createAnonymousClient();
  let query = supabase
    .from("articles")
    .select(BREAKING_FIELDS)
    .eq("is_breaking", true)
    .in("status", VISIBLE_STATUSES)
    .lte("published_at", nowIso());
  if (withinHours) {
    query = query.gte("published_at", new Date(Date.now() - withinHours * 3_600_000).toISOString());
  }
  const { data, error } = await query
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as RankedArticle[];
}

/**
 * The day's stories, for the bulletin board.
 *
 * A rolling twenty-four hours rather than since midnight. "The current day" on
 * a news site means the last day's news, and anchoring to midnight would empty
 * the board every morning and make what it shows depend on which timezone the
 * server happens to run in — which, for a paper read in India and deployed in
 * Sydney, is a bug waiting rather than a detail.
 */
export async function getTopOfDay(limit = 50): Promise<RankedArticle[]> {
  const supabase = createAnonymousClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("articles")
    .select(BREAKING_FIELDS)
    .in("status", VISIBLE_STATUSES)
    .lte("published_at", nowIso())
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as RankedArticle[];
}

/**
 * How many hours of staleness the least important section is worth.
 *
 * The strip has to answer two questions at once: what just happened, and what
 * matters. Ranking on recency alone puts a weather alert above a government
 * collapsing because it landed four minutes later; ranking on section alone
 * pins Politics to the bar all day after the story has stopped being news.
 *
 * So age in hours is the base score and the section adds a handicap on top:
 * nothing for the leading section, this many hours for the last one. At twelve,
 * a story from the bottom of the running order has to be roughly half a day
 * fresher than one from the top to outrank it — which is about right for a
 * bulletin that is supposed to lead on consequence, not on timestamp.
 */
const SECTION_HANDICAP_HOURS = 12;

/**
 * Order breaking stories for the bar: most worth leading on, first.
 *
 * The handicap is scaled against the sections actually present rather than
 * against raw sort_order values, which are arbitrary — a newsroom numbering its
 * desks 100, 200, 300 means the same thing as one numbering them 1, 2, 3, and
 * neither should change how hard recency is weighted.
 */
export function rankByConsequence(
  articles: RankedArticle[],
  now: number = Date.now(),
): RankedArticle[] {
  if (articles.length < 2) return [...articles];

  const orders = articles.map((article) => article.categories?.sort_order ?? 0);
  const lowest = Math.min(...orders);
  const span = Math.max(...orders) - lowest;

  const score = (article: RankedArticle) => {
    // A story with no timestamp cannot be ranked on recency and should never
    // lead the bar; it sorts last rather than first.
    if (!article.published_at) return Number.POSITIVE_INFINITY;

    const ageHours = (now - Date.parse(article.published_at)) / 3_600_000;
    const order = article.categories?.sort_order ?? 0;
    const handicap = span === 0 ? 0 : ((order - lowest) / span) * SECTION_HANDICAP_HOURS;
    return ageHours + handicap;
  };

  return [...articles].sort((a, b) => score(a) - score(b));
}

/**
 * One query for the whole front page.
 *
 * Fetching a single recent slice and composing hero, rail and shelves from it
 * in memory beats one query per section: a front page with fifteen sections
 * would otherwise mean sixteen round trips to Sydney before the first byte.
 */
export async function getRecentArticles(limit = 90): Promise<ArticleCardData[]> {
  const supabase = createAnonymousClient();
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
  const supabase = createAnonymousClient();
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
  offset = 0,
): Promise<ArticleCardData[]> {
  const supabase = createAnonymousClient();
  const { data, error } = await supabase
    .from("articles")
    .select(CARD_FIELDS)
    .eq("categories.slug", slug)
    .in("status", VISIBLE_STATUSES)
    .lte("published_at", nowIso())
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return [];
  return (data ?? []) as unknown as ArticleCardData[];
}

export async function getArticlesByAuthor(
  slug: string,
  limit = 30,
): Promise<ArticleCardData[]> {
  const supabase = createAnonymousClient();
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
  const supabase = createAnonymousClient();

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
/**
 * Prefix search for suggestions as a reader types.
 *
 * The results page uses websearch syntax, which stems whole words: "orang"
 * matches nothing until "orangutan" is complete. Suggestions want each word
 * treated as the start of a word, so the query is built as prefix terms.
 */
export async function suggestArticles(
  query: string,
  limit = 6,
): Promise<ArticleCardData[]> {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1)
    .slice(0, 6);
  if (!words.length) return [];

  const supabase = createAnonymousClient();
  const { data, error } = await supabase
    .from("articles")
    .select(CARD_FIELDS)
    .textSearch("search_vector", words.map((word) => `${word}:*`).join(" & "), { config: "english" })
    .in("status", VISIBLE_STATUSES)
    .lte("published_at", nowIso())
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as ArticleCardData[];
}

export async function searchArticles(
  query: string,
  limit = 30,
): Promise<ArticleCardData[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = createAnonymousClient();
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
