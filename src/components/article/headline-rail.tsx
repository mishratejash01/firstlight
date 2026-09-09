import Link from "next/link";

import { Byline } from "./byline";
import type { ArticleCardData } from "@/lib/queries/articles";

/**
 * The quiet column beside the hero: headlines and bylines, no images.
 *
 * Restraint is the job here. Adding thumbnails would put the rail into
 * competition with the splash, and a front page with two focal points has none.
 * On a phone it simply follows the hero, separated by a rule.
 */
export function HeadlineRail({ articles }: { articles: ArticleCardData[] }) {
  if (!articles.length) return null;

  return (
    <aside aria-label="More headlines">
      <ul className="divide-y divide-hairline border-t border-hairline lg:border-t-0 lg:pt-0">
        {articles.map((article) => (
          <li key={article.id} className="py-4 first:pt-4 lg:first:pt-0">
            <h3 className="font-serif text-[1.05rem] leading-snug text-ink">
              <Link
                href={`/${article.categories.slug}/${article.slug}`}
                className="hover:text-accent"
              >
                {article.headline}
              </Link>
            </h3>
            <Byline
              author={article.authors}
              publishedAt={article.published_at}
              attributionLabel={article.attribution_label}
              className="mt-1.5"
            />
          </li>
        ))}
      </ul>
    </aside>
  );
}
