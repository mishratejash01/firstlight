import { SITE_NAME } from "@/lib/site";
import type { Metadata } from "next";

import { BreakingStrip } from "@/components/article/breaking-strip";
import { HeroStory } from "@/components/article/hero-story";
import { HeadlineRail } from "@/components/article/headline-rail";
import { ArticleCard } from "@/components/article/article-card";
import { SectionShelf } from "@/components/article/section-shelf";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getNavCategories } from "@/lib/queries/navigation";
import {
  getLivePlacements,
  getRecentArticles,
  type ArticleCardData,
} from "@/lib/queries/articles";

export const metadata: Metadata = {
  title: `${SITE_NAME} — reporting on politics, business, science and culture`,
  description:
    "Independent reporting across politics, business, technology, science, health, sport and culture.",
};

// The front page changes as stories publish, so it is rendered per request and
// cached briefly at the edge rather than baked at build time.
export const revalidate = 60;

export default async function HomePage() {
  const [articles, placements, categories] = await Promise.all([
    getRecentArticles(90),
    getLivePlacements(),
    getNavCategories(),
  ]);

  if (!articles.length) {
    return (
      <>
        <SiteHeader />
        <main className="route-enter mx-auto max-w-page px-4 py-20 sm:px-6">
          <h1 className="text-hero text-ink">Nothing published yet</h1>
          <p className="mt-3 max-w-measure text-lead text-muted">
            The front page fills itself from the newsroom database as stories
            are published. Nothing here is placeholder markup waiting to be
            replaced.
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  const byId = new Map(articles.map((a) => [a.id, a]));
  const used = new Set<string>();

  const take = (article: ArticleCardData | undefined) => {
    if (!article || used.has(article.id)) return undefined;
    used.add(article.id);
    return article;
  };
  const nextUnused = (count: number) =>
    articles.filter((a) => !used.has(a.id)).slice(0, count);

  // An editor's pin outranks recency. Where no pin is live, the most recent
  // story leads — which is also what happens on a quiet day.
  const pinnedHeroId = placements.find((p) => p.zone === "hero")?.article_id;
  const hero =
    take(pinnedHeroId ? byId.get(pinnedHeroId) : undefined) ??
    take(articles.find((a) => !used.has(a.id)))!;

  // The rail is filled before the secondary pair because it is the zone editors
  // curate by hand; anything they pinned there should not be pulled up into the
  // well just because it happens to be recent.
  const pinnedRail = placements
    .filter((p) => p.zone === "rail")
    .map((p) => take(byId.get(p.article_id)))
    .filter((a): a is ArticleCardData => Boolean(a));

  const rail = [...pinnedRail, ...nextUnused(7 - pinnedRail.length)].slice(
    0,
    7,
  );
  rail.forEach((a) => used.add(a.id));

  // The two stories that sit under the splash, sharing the well with it.
  const secondary = nextUnused(2);
  secondary.forEach((a) => used.add(a.id));

  // Shelves are built from what is left, so no story appears twice on the page.
  // Seven per section fills a lead plus two columns of three rows, which is
  // what it takes to square those columns off against the depth of the lead's
  // picture on a wide screen. Narrower screens stack them and never notice.
  const shelves = categories
    .map((category) => ({
      category,
      articles: articles
        .filter((a) => a.categories.slug === category.slug && !used.has(a.id))
        .slice(0, 7),
    }))
    .filter((shelf) => shelf.articles.length > 0);

  // The strip is a pointer to a breaking story the reader might otherwise
  // scroll past. If the breaking story is already the splash, there is nothing
  // to point at and the row does not render at all.
  const breaking = articles.find((a) => a.is_breaking && a.id !== hero.id);

  return (
    <>
      <SiteHeader />
      {breaking ? <BreakingStrip article={breaking} /> : null}

      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        {/* The well and the rail. Stacked on a phone, eight columns to four
 above it, held apart by space rather than by a rule. */}
        <div className="grid grid-cols-1 gap-x-12 gap-y-10 pt-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <HeroStory article={hero} />

            {secondary.length ? (
              <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
                {secondary.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    variant="lead"
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="lg:col-span-4">
            <HeadlineRail articles={rail} title="Latest" />
          </div>
        </div>

        <div className="space-y-12 pt-14 pb-4">
          {shelves.map(({ category, articles: shelfArticles }) => (
            <SectionShelf
              key={category.slug}
              title={category.name}
              href={`/${category.slug}`}
              articles={shelfArticles}
            />
          ))}
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
