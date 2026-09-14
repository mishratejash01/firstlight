import Link from "next/link";

import { BreakingTag } from "./breaking-tag";
import type { ArticleCardData } from "@/lib/queries/articles";

/**
 * The small category label that sits above a headline.
 *
 * Sentence case at semibold, not tracked-out capitals. On a page carrying forty
 * headlines the reader scans for the section before reading the words, and
 * weight and colour mark it out perfectly well; capitals shout it at the same
 * volume as the headline underneath, which is the one thing a label above a
 * headline must not do.
 *
 * Breaking replaces the label rather than sitting beside it. Two markers above
 * one headline is one more than a reader will use.
 */
export function Eyebrow({
  article,
  className = "",
}: {
  article: Pick<ArticleCardData, "is_breaking" | "categories">;
  className?: string;
}) {
  if (article.is_breaking) {
    return (
      <div className={className}>
        <BreakingTag />
      </div>
    );
  }

  return (
    <div className={className}>
      <Link
        href={`/${article.categories.slug}`}
        className="font-label text-meta font-semibold text-accent underline-offset-4 hover:underline"
      >
        {article.categories.name}
      </Link>
    </div>
  );
}
