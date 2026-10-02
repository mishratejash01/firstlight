import type { LiveHeadline, LiveHeadlines } from "@/lib/live-headlines";
import {
  BREAKING_BANNER_HOURS,
  getBreakingArticles,
  getRecentArticles,
  rankByConsequence,
  type ArticleCardData,
} from "@/lib/queries/articles";

/**
 * The site's live headlines as one small file: the breaking banner, the
 * header's section panels and the "Latest" column. See lib/live-headlines.
 *
 * Rebuilt at most once a minute, and stored again only when a story has come
 * or gone, so a quiet minute costs nothing.
 */
export const revalidate = 60;

/** One more than the banner shows, so it can skip the story being read and still run ten. */
const BREAKING_ITEMS = 11;
/** One more than the column shows, for the same reason. */
const LATEST_ITEMS = 7;
const PER_SECTION = 3;

function slim(article: Pick<ArticleCardData, "id" | "slug" | "headline" | "hero_image_url" | "hero_image_alt"> & {
  categories: { slug: string; name: string };
}): LiveHeadline {
  return {
    id: article.id,
    slug: article.slug,
    headline: article.headline,
    hero_image_url: article.hero_image_url,
    hero_image_alt: article.hero_image_alt,
    categories: { slug: article.categories.slug, name: article.categories.name },
  };
}

export async function GET() {
  const [recent, breaking] = await Promise.all([
    getRecentArticles(60),
    getBreakingArticles(60, BREAKING_BANNER_HOURS),
  ]);

  const bySection: Record<string, LiveHeadline[]> = {};
  for (const article of recent) {
    const list = (bySection[article.categories.slug] ??= []);
    if (list.length < PER_SECTION) list.push(slim(article));
  }

  const body: LiveHeadlines = {
    breaking: rankByConsequence(breaking).slice(0, BREAKING_ITEMS).map(slim),
    latest: recent.slice(0, LATEST_ITEMS).map(slim),
    bySection,
  };

  return Response.json(body);
}
