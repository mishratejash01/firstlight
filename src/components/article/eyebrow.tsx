import Link from "next/link";

import { BreakingTag } from "./breaking-tag";
import type { ArticleCardData } from "@/lib/queries/articles";

/**
 * The small capitalised category label that sits above a headline.
 *
 * A wire-service convention, and it earns its place for a reason the plain
 * sentence-case link did not: on a page carrying forty headlines a reader scans
 * for the section before they read the words, and a label set apart in size,
 * weight and case is found without being read. It stays 11px and navy so it
 * never competes with the headline it introduces.
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
        className="eyebrow text-accent hover:underline underline-offset-4"
      >
        {article.categories.name}
      </Link>
    </div>
  );
}
