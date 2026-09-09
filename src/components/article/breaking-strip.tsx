import Link from "next/link";

import { BreakingTag } from "./breaking-tag";
import type { ArticleCardData } from "@/lib/queries/articles";

/**
 * The band under the flag that a newsroom uses when something is happening.
 *
 * It renders only when an editor has actually marked a story as breaking, so on
 * an ordinary day the front page simply does not have this row. That is the
 * point: a strip that is always present stops meaning anything, and the signal
 * colour is worth keeping expensive.
 */
export function BreakingStrip({ article }: { article: ArticleCardData }) {
  return (
    <div className="border-b border-hairline">
      <div className="mx-auto flex max-w-page items-baseline gap-3 px-4 py-2 sm:px-6">
        <BreakingTag />
        <Link
          href={`/${article.categories.slug}/${article.slug}`}
          className="text-meta font-medium text-ink hover:text-accent"
        >
          {article.headline}
        </Link>
      </div>
    </div>
  );
}
