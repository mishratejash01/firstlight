import { Source_Serif_4 } from "next/font/google";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { EpaperSheet } from "@/components/epaper/epaper-page";
import { EpaperViewer } from "@/components/epaper/epaper-viewer";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { composeEdition } from "@/lib/epaper/compose";
import {
  editionWindow,
  formatEditionDate,
  isEditionDate,
  isReleased,
  shiftDate,
  windowLabel,
} from "@/lib/epaper/edition";
import { makePuzzles } from "@/lib/epaper/puzzles";
import { getEditionArticles, getEditionHeadlines } from "@/lib/queries/epaper";
import { getAllSections } from "@/lib/queries/navigation";
import { pageMetadata } from "@/lib/seo/metadata";
import { SITE_NAME } from "@/lib/site";

import "../epaper.css";

/**
 * One day's e-paper: /epaper/2026-10-15.
 *
 * An edition's window has closed by the time it can be asked for, so its
 * stories are fixed: cached for an hour like a story page, which also picks
 * up corrections made to its stories since. An edition not yet out, or a day
 * with nothing published, is a 404.
 *
 * Kept out of search: every story in it is already on the site under its own
 * address, and an edition is a second copy of them.
 */
export const revalidate = 3600;

// Newspaper type for the paper itself: a serif for headlines and text,
// loaded on these pages only.
const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-epaper",
  display: "swap",
  style: ["normal", "italic"],
});

type Props = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  if (!isEditionDate(date)) return { title: "Not found" };
  return pageMetadata({
    title: `E-paper, ${formatEditionDate(date)}`,
    description: `${SITE_NAME}'s morning edition for ${formatEditionDate(date)}. ${windowLabel(date)}, page by page.`,
    path: `/epaper/${date}`,
    noindex: true,
  });
}

export default async function EditionPage({ params }: Props) {
  const { date } = await params;
  if (!isEditionDate(date) || !isReleased(date)) notFound();

  const { start, end } = editionWindow(date);
  const yesterday = shiftDate(date, -1);
  const before = editionWindow(yesterday);
  const [articles, sections, yesterdayHeadlines] = await Promise.all([
    getEditionArticles(start, end),
    getAllSections(),
    // Yesterday's headlines rebuild yesterday's puzzles, for their solutions.
    getEditionHeadlines(before.start, before.end),
  ]);
  if (!articles.length) notFound();

  // Today's puzzles and yesterday's, both made from their date and headlines
  // in publication order, so the solutions printed tomorrow match exactly.
  const puzzles = makePuzzles(date, articles.map((article) => article.headline));
  const solutions = yesterdayHeadlines.length ? makePuzzles(yesterday, yesterdayHeadlines) : null;

  const order = new Map(sections.map((section, index) => [section.slug, index]));
  const pages = composeEdition(articles, order, { puzzles: true });

  return (
    <>
      <SiteHeader />
      <main className={`ep route-enter ${serif.variable}`}>
        <h1 className="sr-only">
          {SITE_NAME} e-paper, {formatEditionDate(date)}
        </h1>
        <EpaperViewer
          date={date}
          titles={pages.map((page) => page.title)}
          pages={pages.map((page) => (
            <EpaperSheet
              key={page.number}
              page={page}
              pages={pages}
              date={date}
              puzzles={puzzles}
              solutions={solutions}
            />
          ))}
        />
      </main>
      <SiteFooter />
    </>
  );
}
