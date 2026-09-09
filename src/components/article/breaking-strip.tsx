import Link from "next/link";

import type { ArticleCardData } from "@/lib/queries/articles";

/**
 * The band under the flag that a newsroom uses when something is happening.
 *
 * It renders only when an editor has actually marked a story as breaking, so on
 * an ordinary day the front page simply does not have this row. That is the
 * point: a strip that is always present stops meaning anything.
 *
 * Reversed out of the signal red rather than set in it, which is what makes it
 * read as an alert from across the room instead of as one more headline. Label
 * and headline are both white: white on this red clears the contrast bar for
 * small text, where near-black on it does not. The label does not reuse
 * BreakingTag because that component's job is to be red against white — the
 * exact opposite of here.
 *
 * On a phone the headline scrolls as a ticker rather than wrapping to a second
 * row; see .ticker in globals.css for how the loop is made seamless.
 */
export function BreakingStrip({ article }: { article: ArticleCardData }) {
  const href = `/${article.categories.slug}/${article.slug}`;

  return (
    <div className="bg-signal">
      <div className="mx-auto flex max-w-page items-center gap-4 px-4 py-2.5 sm:px-6">
        <span className="eyebrow shrink-0 text-paper">Breaking</span>

        <div className="ticker min-w-0 flex-1">
          <div className="ticker-track">
            <Link
              href={href}
              className="ticker-copy text-lead text-paper underline-offset-4 hover:underline sm:pe-0"
            >
              {article.headline}
            </Link>
            {/* The second copy exists only to make the loop seamless, so it is
                hidden from screen readers, and from the desktop layout where
                nothing is moving and one copy is all that is needed. */}
            <span
              aria-hidden="true"
              className="ticker-copy text-lead text-paper sm:hidden"
            >
              {article.headline}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
