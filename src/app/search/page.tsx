import { SITE_NAME } from "@/lib/site";
import { after } from "next/server";
import type { Metadata } from "next";

import { ArticleCard } from "@/components/article/article-card";
import { SiteFooter } from "@/components/site/site-footer";
import { SearchField } from "@/components/site/search-field";
import { SiteHeader } from "@/components/site/site-header";
import { searchArticles } from "@/lib/queries/articles";
import { captureRequestContext, logSearch } from "@/lib/analytics/server-events";

export const metadata: Metadata = {
  title: `Search — ${SITE_NAME}`,
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
    const requestContext = await captureRequestContext();
    after(() =>
      logSearch({ query, resultCount: results.length, context: requestContext }),
    );
  }

  return (
    <>
      <SiteHeader />

      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <div className="border-b border-hairline py-8">
          <h1 className="text-hero text-ink">Search</h1>
          <div className="mt-5">
            <SearchField variant="full" defaultValue={query} />
          </div>
        </div>

        {query ? (
          <p className="py-6 text-meta text-muted">
            {results.length === 0
              ? `Nothing found for “${query}”.`
              : `${results.length} result${results.length === 1 ? "" : "s"} for “${query}”.`}
          </p>
        ) : null}

        {results.length ? (
          <div className="story-grid pb-12">
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
