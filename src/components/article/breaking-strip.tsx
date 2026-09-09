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
 * read as an alert from across the room instead of as one more headline. The
 * label carries its own colour rather than reusing BreakingTag, because that
 * component's job is to be red against white — the exact opposite of here.
 */
export function BreakingStrip({ article }: { article: ArticleCardData }) {
  return (
    <div className="bg-signal">
      <div className="mx-auto flex max-w-page items-baseline gap-3 px-4 py-2.5 sm:px-6">
        <span className="eyebrow shrink-0 text-ink">Breaking</span>
        <Link
          href={`/${article.categories.slug}/${article.slug}`}
          className="text-meta font-semibold text-paper underline-offset-4 hover:underline"
        >
          {article.headline}
        </Link>
      </div>
    </div>
  );
}
