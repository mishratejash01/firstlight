import type { Metadata } from "next";

import { HeroStory } from "@/components/article/hero-story";
import { HeadlineRail } from "@/components/article/headline-rail";
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
  title: "Newswebsite — reporting on politics, business, science and culture",
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
        <main className="route-enter mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h1 className="font-serif text-hero text-ink">Nothing published yet</h1>
          <p className="mt-3 max-w-measure text-lead text-muted">
            The front page fills itself from the newsroom database as stories are
            published. Nothing here is placeholder markup waiting to be replaced.
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

  // An editor's pin outranks recency. Where no pin is live, the most recent
  // story leads — which is also what happens on a quiet day.
  const pinnedHeroId = placements.find((p) => p.zone === "hero")?.article_id;
  const hero =
    take(pinnedHeroId ? byId.get(pinnedHeroId) : undefined) ??
    take(articles.find((a) => !used.has(a.id)))!;

  const pinnedRail = placements
    .filter((p) => p.zone === "rail")
    .map((p) => take(byId.get(p.article_id)))
    .filter((a): a is ArticleCardData => Boolean(a));

  const rail = [
    ...pinnedRail,
    ...articles.filter((a) => !used.has(a.id)).slice(0, 5 - pinnedRail.length),
  ].slice(0, 5);
  rail.forEach((a) => used.add(a.id));

  // Shelves are built from what is left, so no story appears twice on the page.
  const shelves = categories
    .map((category) => ({
      category,
      articles: articles
        .filter((a) => a.categories.slug === category.slug && !used.has(a.id))
        .slice(0, 4),
    }))
    .filter((shelf) => shelf.articles.length > 0);

  return (
    <>
      <SiteHeader />

      <main className="route-enter mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hero and rail. Stacked on a phone, two thirds / one third above it. */}
        <div className="grid gap-8 py-8 lg:grid-cols-3 lg:gap-10">
          <div className="lg:col-span-2">
            <HeroStory article={hero} />
          </div>
          <div className="lg:border-l lg:border-hairline lg:pl-8">
            <HeadlineRail articles={rail} />
          </div>
        </div>

        <div className="space-y-12 pb-4">
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
