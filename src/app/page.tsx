import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import type { Metadata } from "next";

import { HeroStory } from "@/components/article/hero-story";
import { ArticleCard } from "@/components/article/article-card";
import { BriefGrid } from "@/components/article/brief-grid";
import { BulletinBoard } from "@/components/article/bulletin-board";
import { SectionDigest } from "@/components/article/section-digest";
import { SectionShelf } from "@/components/article/section-shelf";
import { OpinionShelf } from "@/components/article/opinion-shelf";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getNavCategories } from "@/lib/queries/navigation";
import {
  getLivePlacements,
  getRecentArticles,
  getTopOfDay,
  rankByConsequence,
  type ArticleCardData,
} from "@/lib/queries/articles";

export const metadata: Metadata = {
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description:
    "Independent reporting across politics, business, technology, science, health, sport and culture.",
};

// The front page changes as stories publish, so it is rendered per request and
// cached briefly at the edge rather than baked at build time.
export const revalidate = 60;

export default async function HomePage() {
  const [articles, placements, categories, dayTop] = await Promise.all([
    getRecentArticles(90),
    getLivePlacements(),
    getNavCategories(),
    getTopOfDay(50),
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

  // The briefs beside the splash: one with a picture, then pairs beneath it.
  // Six is what finishes level with a lead of this depth — the count is set by
  // the splash's height, not by how many stories happen to be spare.
  const briefs = [...pinnedRail, ...nextUnused(6 - pinnedRail.length)].slice(
    0,
    6,
  );
  briefs.forEach((a) => used.add(a.id));

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

  // Only the leading sections get a picture block of their own; the rest are
  // listed at the foot. Twenty full blocks is not a front page, it is twenty
  // front pages stacked.
  // Section marks, so a brief can show its section's icon beside the name.
  const iconBySlug = new Map(categories.map((c) => [c.slug, c.icon_url]));

  const FULL_BLOCKS = 5;
  const featured = shelves.slice(0, FULL_BLOCKS);
  const remaining = shelves.slice(FULL_BLOCKS);

  // The day's fifty, ordered the way the breaking bar orders its alerts: how
  // recent against how much the desk matters. The board is a round of the whole
  // day's news rather than a second front page, so nothing is excluded from it
  // — a reader who has just read the splash still expects it to come round.
  //
  // Capped here as well as in the query. The limit belongs in the SQL so the
  // rows are never fetched, but the board's own promise is "the day's fifty"
  // and that number should not depend on a backend honouring a limit clause.
  const BOARD_SIZE = 50;
  const boardItems = rankByConsequence(dayTop)
    .slice(0, BOARD_SIZE)
    .map((article) => ({
      id: article.id,
      headline: article.headline,
      href: `/${article.categories.slug}/${article.slug}`,
      category: article.categories.name,
    }));

  return (
    <>
      {/* The splash is named so the bar does not point at the story
          already filling the top of this page. */}
      <SiteHeader excludeId={hero.id} />

      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        {/* The splash on the left; the right side stacked in rows of differing
            width rather than a second and third column of equal weight. Two
            stories side by side, then one across the full width, then the
            digest — which descends in size the way a front page should, and
            lets the right side finish level with the splash instead of running
            past it. They stack in reading order on a phone. */}
        <div className="grid grid-cols-1 gap-x-10 gap-y-10 border-b border-hairline pt-8 pb-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <HeroStory article={hero} />
          </div>

          {/* Many stories, each given a little, against the one story given a
              lot. Two columns of briefs finish level with the splash where a
              single column of full cards ran a screen past it. */}
          <div className="lg:col-span-5">
            <BriefGrid articles={briefs} iconBySlug={iconBySlug} />
          </div>
        </div>

        {boardItems.length ? (
          <div className="pt-10">
            <BulletinBoard items={boardItems} brand={SITE_NAME} />
          </div>
        ) : null}

        {/* A rule closes each section rather than separating it from the next:
            the blue bar and the section's own mark open it, and a block that
            opens with a marker and ends with a line reads as finished. */}
        <div className="pt-14 pb-4">
          {featured.map(({ category, articles: shelfArticles }) => {
            // Which block a section gets is a property of the section, read
            // from the database — not a component asking whether the slug
            // happens to be "opinion".
            const Shelf =
              category.layout === "opinion" ? OpinionShelf : SectionShelf;
            return (
              <div
                key={category.slug}
                className="border-b border-muted/35 pb-12 not-first:pt-12"
              >
                <Shelf
                  title={category.name}
                  href={`/${category.slug}`}
                  articles={shelfArticles}
                  iconUrl={category.icon_url}
                />
              </div>
            );
          })}

          <SectionDigest sections={remaining} />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
