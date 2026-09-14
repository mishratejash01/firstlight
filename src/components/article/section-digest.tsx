import Image from "next/image";
import Link from "next/link";

import type { ArticleCardData } from "@/lib/queries/articles";
import type { NavCategory } from "@/lib/queries/navigation";
import { formatTimeAgo } from "@/lib/format/datetime";

/**
 * The tail of the front page.
 *
 * First every remaining section as a named block — a reader looking for their
 * subject finds it here by name and mark, without reading a single headline.
 * Then each of those sections gets its own compact grid of headlines, so the
 * page ends on news rather than on a menu, and a reader following one subject
 * finds its stories together instead of scattered through a mixed run.
 *
 * A front page that gives twenty sections a full picture block of their own is
 * not a front page, it is twenty front pages stacked. The sections that lead
 * get the room; these get named, listed and linked.
 */
export function SectionDigest({
  sections,
}: {
  sections: { category: NavCategory; articles: ArticleCardData[] }[];
}) {
  if (!sections.length) return null;

  // Each section keeps its own grid rather than being poured into one mixed
  // run. A reader following a subject wants that subject's stories together;
  // shuffled by timestamp they would have to read every label to find them.
  const withStories = sections.filter(({ articles }) => articles.length > 0);

  return (
    <section className="pt-12">
      <h2 className="font-label flex items-center gap-3 text-[1.75rem] font-semibold text-ink">
        <span
          aria-hidden="true"
          className="inline-block h-[1.15em] w-[5px] shrink-0 rounded-[2px] bg-accent"
        />
        Categories to read more
      </h2>

      <ul className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {sections.map(({ category }) => (
          <li key={category.slug}>
            <Link
              href={`/${category.slug}`}
              className="flex h-full flex-col items-center gap-2.5 rounded-panel bg-wash p-6 text-center hover:text-accent"
            >
              <span className="flex h-10 items-end">
                {category.icon_url ? (
                  <Image
                    src={category.icon_url}
                    alt=""
                    aria-hidden="true"
                    width={40}
                    height={40}
                    className="h-10 w-10 object-contain"
                  />
                ) : null}
              </span>
              <span className="font-label text-body font-semibold text-ink">
                {category.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {withStories.map(({ category, articles }) => (
        <div
          key={category.slug}
          className="mt-9 border-t border-muted/35 pt-6 first-of-type:mt-10"
        >
          <h3 className="flex items-center gap-2.5">
            {category.icon_url ? (
              <Image
                src={category.icon_url}
                alt=""
                aria-hidden="true"
                width={32}
                height={32}
                className="h-6 w-6 shrink-0 object-contain"
              />
            ) : null}
            <Link
              href={`/${category.slug}`}
              className="font-label text-[1.0625rem] font-semibold text-ink hover:text-accent"
            >
              {category.name}
            </Link>
          </h3>

          <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
            {articles.slice(0, 4).map((article) => (
              <article key={article.id} className="group">
                <h4 className="text-[1rem] leading-[1.28] text-ink group-hover:text-accent">
                  <Link href={`/${article.categories.slug}/${article.slug}`}>
                    {article.headline}
                  </Link>
                </h4>
                {article.published_at ? (
                  <p className="mt-1.5 text-meta text-muted">
                    <time dateTime={article.published_at}>
                      {formatTimeAgo(article.published_at)}
                    </time>
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
