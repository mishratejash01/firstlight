import { suggestArticles } from "@/lib/queries/articles";

/**
 * Suggestions for the search field: a prefix search over the same index the
 * results page uses, so a reader sees matches while a word is still being
 * typed.
 * Public, read-only, and cached briefly at the edge: the same few letters
 * arrive from many readers at once.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (query.length < 2) return Response.json({ suggestions: [] });

  const results = await suggestArticles(query, 6);
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
