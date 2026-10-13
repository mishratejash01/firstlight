import { createAnonymousClient } from "@/lib/supabase/anonymous";

/**
 * Read queries for case studies: articles of format 'case_study'.
 *
 * Scoped to what a reader may see, as the article queries are. A case study
 * carries its subject as a section slug (subject_slug) beside the section it
 * is filed under, which is always Case studies.
 */

const FIELDS = `
  id, slug, headline, standfirst, summary, hero_image_url, hero_image_alt,
  published_at, reviewed_at, subject_slug,
  categories!inner ( slug, name )
`;

const VISIBLE_STATUSES = ["published", "scheduled"] as const;

export type CaseStudyCardData = {
  id: string;
  slug: string;
  headline: string;
  standfirst: string | null;
  summary: string | null;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  published_at: string | null;
  reviewed_at: string | null;
  subject_slug: string | null;
  categories: { slug: string; name: string };
};

const nowIso = () => new Date().toISOString();

/** Case studies, newest first, for the section front and its older pages. */
export async function getCaseStudies(limit = 30, offset = 0): Promise<CaseStudyCardData[]> {
  const supabase = createAnonymousClient();
  const { data, error } = await supabase
    .from("articles")
    .select(FIELDS)
    .eq("format", "case_study")
    .in("status", VISIBLE_STATUSES)
    .lte("published_at", nowIso())
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return [];
  return (data ?? []) as unknown as CaseStudyCardData[];
}

/** The newest few, for the front page's shelf. */
export async function getRecentCaseStudies(limit = 4): Promise<CaseStudyCardData[]> {
  return getCaseStudies(limit, 0);
}

/**
 * The case study a story should point at: the most recently reviewed one
 * that shares a topic tag with it. Tags are the same signal the related
 * stories ranking leads with, so the box and the ranking agree.
 */
export async function getCaseStudyFor(articleId: string): Promise<CaseStudyCardData | null> {
  const supabase = createAnonymousClient();
  const { data: tags } = await supabase.from("article_tags").select("tag_id").eq("article_id", articleId);
  const tagIds = (tags ?? []).map((row) => row.tag_id);
  if (!tagIds.length) return null;

  const { data, error } = await supabase
    .from("articles")
    .select(`${FIELDS}, article_tags!inner ( tag_id )`)
    .eq("format", "case_study")
    .in("status", VISIBLE_STATUSES)
    .lte("published_at", nowIso())
    .in("article_tags.tag_id", tagIds)
    .neq("id", articleId)
    .order("reviewed_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  const { article_tags: _tags, ...card } = data[0] as unknown as CaseStudyCardData & { article_tags: unknown };
  void _tags;
  return card;
}
