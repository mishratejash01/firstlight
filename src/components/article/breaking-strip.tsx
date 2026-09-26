import Link from "next/link";

import type { RankedArticle } from "@/lib/queries/articles";

/**
 * The band under the flag that a newsroom uses when something is happening.
 *
 * It renders only when an editor has actually marked a story as breaking, so on
 * an ordinary day the front page simply does not have this row. That is the
 * point: a strip that is always present stops meaning anything.
 *
 * Every alert runs across it in one continuous line, right to left, separated
 * by a rule. Not one headline at a time: a rota makes a reader wait to learn
 * there is anything else at all, and hides how much is happening. A run says it
 * at a glance. The order is not the order they were filed — see
 * rankByConsequence, which weighs how recent a story is against how much the
 * desk it came from matters.
 *
 * No state, no timer, no client bundle: the movement is a CSS animation over
 * markup rendered on the server, and it pauses on hover and on focus through
 * CSS alone. See .marquee in globals.css.
 *
 * A pale red ground with the label on full signal red against it. The band is
 * still unmistakable from across the room, but the headlines sit in ink rather
 * than reversed out, which is far easier to read at a glance than white on a
 * saturated red — and it leaves the strongest red on the page for the one word
 * that earns it. The label does not reuse BreakingTag because that component's
 * job is red type on white, not white type on red.
 */

/**
 * How long a character takes to cross the bar.
 *
 * The run is timed from how much copy it carries so the speed stays the same
 * whatever the newsroom has filed. Roughly nine pixels a character at this
 * size, and a comfortable reading pace for a moving line is about 120 pixels a
 * second — which is where this number comes from rather than from taste.
 */
const SECONDS_PER_CHARACTER = 0.075;
const MIN_SECONDS = 24;
const MAX_SECONDS = 150;

export function BreakingStrip({ articles }: { articles: RankedArticle[] }) {
  if (!articles.length) return null;

  const characters = articles.reduce(
    (total, article) => total + article.headline.length,
    0,
  );
  const duration = Math.min(
    MAX_SECONDS,
    Math.max(MIN_SECONDS, Math.round(characters * SECONDS_PER_CHARACTER)),
  );

  // Two copies, so the halfway translate lands copy two exactly where copy one
  // started. The second is hidden from screen readers, which should hear the
  // list of alerts once, and taken out of the tab order for the same reason.
  const run = (hidden: boolean) => (
    <span
      className="inline-flex items-center"
      aria-hidden={hidden ? "true" : undefined}
    >
      {articles.map((article) => (
        <span key={article.id} className="inline-flex items-center">
          <Link
            href={`/${article.categories.slug}/${article.slug}`}
            tabIndex={hidden ? -1 : undefined}
            className="text-lead text-ink underline-offset-4 hover:underline"
          >
            {article.headline}
          </Link>
          {/* The separator between alerts. Without it a run of headlines reads
              as one long sentence that keeps changing subject. */}
          <span
            aria-hidden="true"
            className="mx-7 inline-block h-4 w-px shrink-0 bg-signal/45"
          />
        </span>
      ))}
    </span>
  );

  return (
    <div className="bg-signal-soft">
      <div className="mx-auto flex max-w-wide items-center gap-4 px-4 py-2.5 sm:px-6">
        {/* The label is the way into the full list. A reader who sees an alert
            go past before they could read it needs somewhere to find it again,
            and the word is where they will look. */}
        <Link
          href="/breaking"
          className="eyebrow shrink-0 rounded-control bg-signal px-2 py-1 text-paper hover:opacity-90"
        >
          Breaking news
        </Link>

        <div className="marquee min-w-0 flex-1">
          <div
            className="marquee-track"
            style={{ ["--marquee-duration" as string]: `${duration}s` }}
          >
            {run(false)}
            {run(true)}
          </div>
        </div>
      </div>
    </div>
  );
}
