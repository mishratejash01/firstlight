import { ArticleRow } from "./article-row";
import type { ArticleCardData } from "@/lib/queries/articles";

/**
 * The latest column beside the lead.
 *
 * Rows rather than plain headlines: this column's job is to show that a lot is
 * happening, and a thumbnail identifies a story faster than its first four
 * words do. They stay small on purpose — big enough to recognise, too small to
 * compete with the picture on the splash, because a front page with two focal
 * points has none.
 *
 * On a phone it simply follows the lead.
 */
export function HeadlineRail({
  articles,
  title,
}: {
  articles: ArticleCardData[];
  title: string;
}) {
  if (!articles.length) return null;

  return (
    <aside aria-label={title}>
      <h2 className="eyebrow border-t-2 border-ink pt-2.5 text-ink">{title}</h2>
      <ul className="mt-3 divide-y divide-hairline">
        {articles.map((article) => (
          <li key={article.id} className="py-4 first:pt-3">
            {/* No eyebrow on these rows: the column is already one labelled
                group, and a category tag on every line would out-shout the
                headlines it is meant to introduce. */}
            <ArticleRow article={article} showEyebrow={false} />
          </li>
        ))}
      </ul>
    </aside>
  );
}
