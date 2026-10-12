import { BreakingTag } from "./breaking-tag";
import type { ArticleCardData } from "@/lib/queries/articles";

/**
 * What sits above a headline: nothing, unless the story is breaking.
 *
 * The section name used to sit here on every headline. It is gone: the section
 * is already said by the nav, by the block a story sits in, and by the
 * category-and-time line under each card, so a third copy above the headline
 * only pushed the words a reader came for further down.
 *
 * Breaking stays. It is not a section but a state, and it is the one thing a
 * reader needs to know before the headline rather than after it.
 */
export function Eyebrow({
  article,
  className = "",
}: {
  article: Pick<ArticleCardData, "is_breaking">;
  className?: string;
}) {
  if (!article.is_breaking) return null;

  return (
    <div className={className}>
      <BreakingTag />
    </div>
  );
}
