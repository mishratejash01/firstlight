import { searchArticles } from "@/lib/queries/articles";

/**
 * Suggestions for the search field, from the same full-text search the
 * results page runs, so nothing is suggested that a search would not find.
 * Public, read-only, and cached briefly at the edge: the same few letters
 * arrive from many readers at once.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (query.length < 2) return Response.json({ suggestions: [] });

  const results = await searchArticles(query, 6);
  const suggestions = results.map((article) => ({
    headline: article.headline,
    href: `/${article.categories.slug}/${article.slug}`,
    section: article.categories.name,
  }));

  return Response.json(
    { suggestions },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
  );
}
