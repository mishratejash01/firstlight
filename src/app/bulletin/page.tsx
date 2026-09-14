import type { Metadata } from "next";
import Link from "next/link";

import { SITE_NAME } from "@/lib/site";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { BulletinPlayer } from "@/components/article/bulletin-player";
import { buildBulletin, formatRunTime } from "@/lib/bulletin/script";
import {
  getBreakingArticles,
  getRecentArticles,
  rankByConsequence,
  type ArticleCardData,
} from "@/lib/queries/articles";

export const metadata: Metadata = {
  title: `News bulletin — ${SITE_NAME}`,
  description:
    "The main stories of the day, as a running order you can listen to.",
  alternates: { canonical: "/bulletin" },
};

// A bulletin is only worth listening to if it is current.
export const revalidate = 60;

/** Stories in the bulletin. Eight runs about two and a half minutes. */
const STORY_COUNT = 8;

/**
 * The spoken bulletin.
 *
 * Breaking first, then the day's lead stories, the way a broadcast runs its
 * top-of-hour: what has just happened, then what else matters. Both lists come
 * from the same database the front page is built from, so the bulletin can
 * never disagree with the paper.
 *
 * The script is assembled from published headlines and standfirsts rather than
 * written — see lib/bulletin/script for why that matters.
 */
export default async function BulletinPage() {
  const [recent, breakingAll] = await Promise.all([
    getRecentArticles(40),
    getBreakingArticles(),
  ]);

  const picked: ArticleCardData[] = [];
  const seen = new Set<string>();
  const add = (article: ArticleCardData) => {
    if (seen.has(article.id) || picked.length >= STORY_COUNT) return;
    seen.add(article.id);
    picked.push(article);
  };

  rankByConsequence(breakingAll).forEach(add);
  recent.forEach(add);

  const { lines, seconds } = buildBulletin(picked);

  return (
    <>
      <SiteHeader />
      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <div className="mx-auto max-w-3xl py-10">
          <h1 className="text-hero leading-tight text-ink">News bulletin</h1>
          <p className="mt-3 text-lead leading-relaxed text-muted">
            The main stories, read aloud. {picked.length} stories, about{" "}
            {formatRunTime(seconds)}.
          </p>

          {lines.length ? (
            <>
              <div className="mt-8">
                <BulletinPlayer lines={lines} />
              </div>

              {/* Said plainly rather than buried in a policy page. A reader
                  hearing a synthetic voice read the news is owed both facts:
                  that no person recorded this, and that no machine wrote it. */}
              <p className="mt-8 rounded-panel bg-wash px-5 py-4 text-meta leading-relaxed text-muted">
                Read by your device&rsquo;s own speech engine, not by a
                journalist — no recording is made or sent anywhere. The words
                are the published headlines and standfirsts of the stories
                below, written and approved by {SITE_NAME}&rsquo;s editors.
                Nothing in this bulletin is generated.
              </p>
            </>
          ) : (
            <p className="mt-10 rounded-panel bg-wash px-5 py-6 text-body text-ink">
              There is nothing to read out yet. The bulletin builds itself from
              published stories — as soon as the newsroom publishes, it appears
              here. <Link href="/" className="text-accent hover:underline">
                Back to the front page
              </Link>
              .
            </p>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
