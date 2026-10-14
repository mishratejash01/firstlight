import { createAnonymousClient } from "@/lib/supabase/anonymous";

import type { ArticleCardData } from "@/lib/queries/articles";

/**
 * The stories one edition of the e-paper holds.
 *
 * The card fields plus what a printed page needs and a card does not: the
 * body (lead stories run in full), the picture credit, the read count (one of
 * the signals the front page is chosen by) and the format, so case studies can
 * be given a page of their own rather than mixed into the news.
 */

const EDITION_FIELDS = `
  id, slug, headline, standfirst, summary, body, hero_image_url, hero_image_alt,
  hero_image_credit, published_at, is_breaking, origin, attribution_url,
  attribution_label, read_count, format,
  categories!inner ( slug, name ),
  authors ( slug, display_name, title, avatar_url )
`;

/** A 'scheduled' row becomes public once its timestamp passes; see the articles migration. */
const VISIBLE_STATUSES = ["published", "scheduled"] as const;

/** Far more than a day has ever carried; a bound so a runaway day cannot fetch the table. */
const MAX_STORIES = 400;

export type EditionArticle = ArticleCardData & {
  body: string | null;
  hero_image_credit: string | null;
  read_count: number | null;
  format: string | null;
};

/** Only the headlines of an edition: enough to rebuild its puzzles for their solutions. */
export async function getEditionHeadlines(start: string, end: string): Promise<string[]> {
  const supabase = createAnonymousClient();
  const { data, error } = await supabase
    .from("articles")
    .select("headline")
    .in("status", VISIBLE_STATUSES)
    .gte("published_at", start)
    .lt("published_at", end)
    .order("published_at", { ascending: false })
    .limit(MAX_STORIES);

  if (error) return [];
  return (data ?? []).map((row) => row.headline as string);
}

export async function getEditionArticles(start: string, end: string): Promise<EditionArticle[]> {
  const supabase = createAnonymousClient();
  const { data, error } = await supabase
    .from("articles")
    .select(EDITION_FIELDS)
    .in("status", VISIBLE_STATUSES)
    .gte("published_at", start)
    .lt("published_at", end)
    .order("published_at", { ascending: false })
    .limit(MAX_STORIES);

  if (error) return [];
  return (data ?? []) as unknown as EditionArticle[];
}
