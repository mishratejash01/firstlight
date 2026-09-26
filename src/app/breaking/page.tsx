import type { Metadata } from "next";

import { pageMetadata } from "@/lib/seo/metadata";
import Image from "next/image";
import Link from "next/link";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import {
  getBreakingArticles,
  type RankedArticle,
} from "@/lib/queries/articles";
import { formatClockTime, formatDate } from "@/lib/format/datetime";
import { cloudinaryImage } from "@/lib/media/transform";

export async function generateMetadata(): Promise<Metadata> {
  const flagged = await getBreakingArticles(1);
  return pageMetadata({
    title: "Breaking News Today",
    description:
      "Breaking news today from India and the world: every story the newsroom has flagged as breaking, newest first.",
    path: "/breaking",
    // With nothing flagged the page is an empty list, not something to rank.
    noindex: flagged.length === 0,
  });
}

// Alerts are the one thing on the site that must never be served stale for
// long, so this page revalidates far more often than the front page does.
export const revalidate = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The full breaking log — where the bar in the header points.
 *
 * The bar shows one alert at a time and moves on after five seconds, which is
 * fine for noticing something and useless for finding it again. This is the
 * page a reader lands on when a bulletin went past before they could read it,
 * so it is a list and not a rota: everything, in one place, in time order.
 *
 * Ordered newest first rather than by the bar's ranking. The bar has to decide
 * what to lead on, because it only has room for one thing at a time; a log has
 * room for all of them, and the only order a log makes sense in is the order
 * things happened.
 *
 * Split at twenty-four hours. Alerts older than that are still worth keeping
 * reachable — a story flagged yesterday evening is the same story this morning
 * — but they are not what a reader means by "what is breaking", so they sit
 * under their own heading rather than padding the top of the page.
 */
function BreakingItem({ article }: { article: RankedArticle }) {
  const href = `/${article.categories.slug}/${article.slug}`;
  const dek = article.standfirst ?? article.summary;

  return (
    <article className="group flex gap-5 border-b border-hairline py-6 first:pt-0">
      {/* The timestamp leads. On a log of alerts, when a thing happened is not
          metadata about the story — it is half of what the reader came to
          find out. */}
      <div className="w-16 shrink-0 sm:w-20">
        {article.published_at ? (
          <time
            dateTime={article.published_at}
            className="font-label text-[0.9375rem] font-semibold tabular-nums text-signal"
          >
            {formatClockTime(article.published_at)}
          </time>
        ) : null}
        <p className="mt-1 text-meta text-muted">{article.categories.name}</p>
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="text-[1.25rem] leading-[1.25] text-pretty text-ink group-hover:text-accent">
          <Link href={href}>{article.headline}</Link>
        </h2>
        {dek ? (
          <p className="mt-2 max-w-[46rem] text-body leading-relaxed text-ink">
            {dek}
          </p>
        ) : null}
      </div>

      {article.hero_image_url ? (
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className="hidden shrink-0 sm:block"
        >
          <span className="relative block h-20 w-32 overflow-hidden rounded-media bg-wash">
            <Image
              src={
                cloudinaryImage(article.hero_image_url, "thumb") ??
                article.hero_image_url
              }
              alt=""
              fill
              sizes="128px"
              className="object-cover"
            />
          </span>
        </Link>
      ) : null}
    </article>
  );
}

export default async function BreakingPage() {
  const all = await getBreakingArticles();

  const cutoff = Date.now() - DAY_MS;
  const isToday = (article: RankedArticle) =>
    article.published_at ? Date.parse(article.published_at) >= cutoff : false;

  const today = all.filter(isToday);
  const earlier = all.filter((article) => !isToday(article));

  return (
    <>
      <SiteHeader />
      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <div className="mx-auto max-w-4xl py-10">
          <h1 className="text-hero leading-tight text-ink">Breaking news</h1>
          <p className="mt-3 text-lead leading-relaxed text-muted">
            Every story the newsroom has flagged as breaking, most recent first.
          </p>

          {all.length ? (
            <>
              {today.length ? (
                <section className="mt-10">
                  <h2 className="eyebrow font-label flex items-baseline gap-3 text-muted">
                    <span>Last 24 hours</span>
                    <span className="tabular-nums">{today.length}</span>
                  </h2>

                  <div className="mt-6">
                    {today.map((article) => (
                      <BreakingItem key={article.id} article={article} />
                    ))}
                  </div>
                </section>
              ) : (
                <p className="mt-10 rounded-panel bg-wash px-5 py-6 text-body text-ink">
                  Nothing has been flagged as breaking in the last twenty-four
                  hours.
                </p>
              )}

              {earlier.length ? (
                <section className="mt-12">
                  <h2 className="eyebrow font-label text-muted">Earlier</h2>
                  <div className="mt-6">
                    {earlier.map((article) => (
                      <div key={article.id}>
                        {/* Older alerts carry a date as well; a clock time on
                            its own stops meaning anything once the day it
                            belonged to has passed. */}
                        {article.published_at ? (
                          <p className="pt-4 text-meta text-muted">
                            {formatDate(article.published_at)}
                          </p>
                        ) : null}
                        <BreakingItem article={article} />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <p className="mt-10 rounded-panel bg-wash px-5 py-6 text-body text-ink">
              Nothing is flagged as breaking. This page fills itself from the
              newsroom — when an editor marks a story as breaking it appears
              here and in the bar under the masthead.
            </p>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
