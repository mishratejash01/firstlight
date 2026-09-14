import Image from "next/image";
import Link from "next/link";

import type { ArticleCardData } from "@/lib/queries/articles";
import type { NavCategory } from "@/lib/queries/navigation";

/**
 * The tail of the front page: every remaining section as a short column of
 * headlines.
 *
 * A front page that gives twenty sections a full picture block is not a front
 * page, it is twenty front pages stacked. The sections that lead get the room;
 * the rest get named, listed, and linked. A reader scanning for whether their
 * subject has anything today is served better by three headlines they can read
 * in a second than by one photograph they have to scroll past.
 */
export function SectionDigest({
  sections,
}: {
  sections: { category: NavCategory; articles: ArticleCardData[] }[];
}) {
  if (!sections.length) return null;

  return (
    <section className="pt-12">
      <h2 className="font-label flex items-center gap-2.5 text-section font-semibold text-ink">
        <span
          aria-hidden="true"
          className="inline-block h-[1.15em] w-[5px] shrink-0 rounded-[2px] bg-accent"
        />
        More sections
      </h2>

      <div className="mt-7 grid grid-cols-1 gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map(({ category, articles }) => (
          <div key={category.slug}>
            <h3 className="flex items-center gap-2 border-b border-muted/35 pb-2">
              {category.icon_url ? (
                <Image
                  src={category.icon_url}
                  alt=""
                  aria-hidden="true"
                  width={32}
                  height={32}
                  className="h-5 w-5 shrink-0 object-contain"
                />
              ) : null}
              <Link
                href={`/${category.slug}`}
                className="font-label text-meta font-semibold text-ink hover:text-accent"
              >
                {category.name}
              </Link>
            </h3>

            <ul className="mt-3 space-y-3">
              {articles.slice(0, 3).map((article) => (
                <li key={article.id}>
                  <Link
                    href={`/${article.categories.slug}/${article.slug}`}
                    className="text-[0.9375rem] leading-[1.3] text-ink hover:text-accent"
                  >
                    {article.headline}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
