import Link from "next/link";

import { ArticleCard } from "./article-card";
import type { ArticleCardData } from "@/lib/queries/articles";

/**
 * A horizontal band of stories from one section.
 *
 * The label is sentence case, set in the serif at section size. Not tracked
 * out, not upper case, no eyebrow above it — the rule underneath does the
 * separating.
 */
export function SectionShelf({
  title,
  href,
  articles,
}: {
  title: string;
  href: string;
  articles: ArticleCardData[];
}) {
  if (!articles.length) return null;

  return (
    <section className="border-t border-hairline pt-6">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-section text-ink">
          <Link href={href} className="hover:text-accent">
            {title}
          </Link>
        </h2>
        <Link href={href} className="shrink-0 text-meta text-accent hover:underline underline-offset-4">
          More {title.toLowerCase()}
        </Link>
      </div>

      <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </section>
  );
}
