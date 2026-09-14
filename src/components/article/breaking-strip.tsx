"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { RankedArticle } from "@/lib/queries/articles";

/**
 * The band under the flag that a newsroom uses when something is happening.
 *
 * It renders only when an editor has actually marked a story as breaking, so on
 * an ordinary day the front page simply does not have this row. That is the
 * point: a strip that is always present stops meaning anything.
 *
 * It carries every breaking story rather than only the leading one, showing
 * them in turn. A newsroom running six alerts at once has six things it wants
 * read, and picking one to display and silently dropping the other five is the
 * bar failing at its job. The order is not the order they were filed — see
 * rankByConsequence, which weighs how recent a story is against how much the desk it
 * came from matters.
 *
 * The clock stops on hover and on keyboard focus. Rotating links are a genuine
 * usability hazard otherwise: a reader moves to click a headline, the bar
 * advances, and they open something they never meant to.
 *
 * A pale red ground with the label on full signal red against it. The band is
 * still unmistakable from across the room, but the headline sits in ink rather
 * than reversed out, which is far easier to read at a glance than white on a
 * saturated red — and it leaves the strongest red on the page for the one word
 * that earns it. The label does not reuse BreakingTag because that component's
 * job is red type on white, not white type on red.
 *
 * On a phone the headline scrolls as a ticker rather than wrapping to a second
 * row; see .ticker in globals.css for how the loop is made seamless.
 */

/** How long each bulletin holds the bar. Matches --breaking-cycle below. */
const CYCLE_MS = 5000;

export function BreakingStrip({ articles }: { articles: RankedArticle[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Guard the index rather than trusting it: the list is re-fetched as the page
  // revalidates, and a bar sitting on the eighth of eight stories when an
  // editor clears three of them would otherwise index off the end.
  const safeIndex = articles.length ? index % articles.length : 0;

  useEffect(() => {
    if (paused || articles.length < 2) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % articles.length);
    }, CYCLE_MS);
    return () => clearInterval(timer);
  }, [paused, articles.length]);

  if (!articles.length) return null;

  const article = articles[safeIndex];
  const href = `/${article.categories.slug}/${article.slug}`;

  return (
    <div
      className="bg-signal-soft"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      // Capture, so focus reaching the headline inside also stops the clock.
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="mx-auto flex max-w-wide items-center gap-4 px-4 py-2.5 sm:px-6">
        {/* The label is the way into the full list. A reader who sees a bulletin
            go past before they could read it needs somewhere to go and find it
            again, and the word is where they will look. */}
        <Link
          href="/breaking"
          className="eyebrow shrink-0 rounded-control bg-signal px-2 py-1 text-paper hover:opacity-90"
        >
          Breaking
        </Link>

        <div
          key={article.id}
          data-paused={paused ? "true" : "false"}
          className="breaking-item min-w-0 flex-1"
          style={{ ["--breaking-cycle" as string]: `${CYCLE_MS}ms` }}
        >
          <div className="ticker">
            <div className="ticker-track">
              <Link
                href={href}
                className="ticker-copy text-lead text-ink underline-offset-4 hover:underline sm:pe-0"
              >
                {article.headline}
              </Link>
              {/* The second copy exists only to make the loop seamless, so it is
                  hidden from screen readers, and from the desktop layout where
                  nothing is moving and one copy is all that is needed. */}
              <span
                aria-hidden="true"
                className="ticker-copy text-lead text-ink sm:hidden"
              >
                {article.headline}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
