import { after } from "next/server";
import type { Metadata } from "next";

import { ArticleCard } from "@/components/article/article-card";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { searchArticles } from "@/lib/queries/articles";
import { logSearch } from "@/lib/analytics/server-events";

export const metadata: Metadata = {
  title: "Search — Newswebsite",
  // Search result pages are thin and infinite in number; keeping them out of
  // the index avoids competing with the articles they point at.
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default async function SearchPage(props: PageProps<"/search">) {
  const params = await props.searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const results = query ? await searchArticles(query, 40) : [];

  // Logged after the response. What readers search for and fail to find is the
  // clearest commissioning signal the newsroom gets, so a zero-result search is
  // recorded as deliberately as a successful one.
  if (query) {
    after(() => logSearch({ query, resultCount: results.length }));
  }

  return (
    <>
      <SiteHeader />

      <main className="route-enter mx-auto max-w-6xl px-4 sm:px-6">
        <div className="border-b border-hairline py-8">
          <h1 className="font-serif text-hero text-ink">Search</h1>
          <form action="/search" method="get" className="mt-5 flex max-w-xl flex-col gap-2 sm:flex-row">
            <label htmlFor="q" className="sr-only">Search articles</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Search reporting"
              className="min-w-0 flex-1 rounded-control border border-hairline bg-paper px-3 py-2.5 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
            <button
              type="submit"
              className="rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90"
            >
              Search
            </button>
          </form>
        </div>

        {query ? (
          <p className="py-6 text-meta text-muted">
            {results.length === 0
              ? `Nothing found for “${query}”.`
              : `${results.length} result${results.length === 1 ? "" : "s"} for “${query}”.`}
          </p>
        ) : null}

        {results.length ? (
          <div className="grid gap-x-6 gap-y-10 pb-12 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        ) : null}
      </main>

      <SiteFooter />
    </>
  );
}
