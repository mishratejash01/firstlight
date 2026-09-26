import Image from "next/image";
import Link from "next/link";
import { SectionMark } from "@/components/site/section-mark";
import { inSentence } from "@/lib/format/section-name";

import type { ArticleCardData } from "@/lib/queries/articles";
import type { NavCategory } from "@/lib/queries/navigation";
import { formatTimeAgo } from "@/lib/format/datetime";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * The tail of the front page.
 *
 * First every remaining section as a named block — a reader looking for their
 * subject finds it here by name and mark, without reading a single headline.
 * Then two of them — the two with the most to show — get a grid of six stories
 * each, so the page ends on news rather than on a menu. Only two: a grid for
 * every section would rebuild the wall of blocks the browse row exists to
 * replace.
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

  // Two sections get a grid, not all of them. Giving every remaining section
  // its own run of stories rebuilt the same wall of blocks the browse row was
  // meant to replace. Two, shown six stories deep, reads as a closing feature;
  // eleven shown four deep reads as an index nobody finishes.
  //
  // The two with the most to show are chosen, so the grids are never half
  // empty — the rest stay reachable through the blocks above.
  const withStories = sections
    .filter(({ articles }) => articles.length >= 3)
    .sort((a, b) => b.articles.length - a.articles.length)
    .slice(0, 2);

  return (
    <section className="pt-12">
      <h2 className="font-label flex items-center gap-3 text-[1.75rem] font-semibold text-ink">
        <span
          aria-hidden="true"
          className="inline-block h-[1.15em] w-[5px] shrink-0 rounded-[2px] bg-accent"
        />
        More sections
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
                  <SectionMark src={category.icon_url} className="h-10 w-10" />
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
          <h3 className="flex items-baseline justify-between gap-4">
            <span className="flex items-center gap-2.5">
              {category.icon_url ? (
                <SectionMark src={category.icon_url} className="h-6 w-6" />
              ) : null}
              <Link
                href={`/${category.slug}`}
                className="font-label text-[1.0625rem] font-semibold text-ink hover:text-accent"
              >
                {category.name}
              </Link>
            </span>
            <Link
              href={`/${category.slug}`}
              className="shrink-0 text-meta text-accent underline-offset-4 hover:underline"
            >
              More {inSentence(category.name)}
            </Link>
          </h3>

          <div className="mt-5 grid grid-cols-1 gap-x-7 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {articles.slice(0, 6).map((article) => (
              <article key={article.id} className="group">
                {/* The picture well is drawn whether or not there is art, so a
                    story filed without one keeps its place in the row instead
                    of riding up and breaking the line of headlines beside it. */}
                <Link
                  href={`/${article.categories.slug}/${article.slug}`}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <div className="relative mb-3 aspect-[16/9] w-full overflow-hidden rounded-media bg-wash">
                    {article.hero_image_url ? (
                      <Image
                        src={
                          cloudinaryImage(article.hero_image_url, "card") ??
                          article.hero_image_url
                        }
                        alt={article.hero_image_alt ?? ""}
                        fill
                        sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) 50vw, 25vw"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                </Link>

                {/* Clamped so every cell in the row is the same depth. Left
                    free, a three-line headline beside a one-line headline
                    leaves the copy and timestamps under them stepping up and
                    down across the grid. */}
                <h4 className="line-clamp-2 text-[1rem] leading-[1.28] text-ink group-hover:text-accent">
                  <Link href={`/${article.categories.slug}/${article.slug}`}>
                    {article.headline}
                  </Link>
                </h4>

                {/* Two lines of the story itself. A headline says what
                    happened; a line of the copy underneath is what tells a
                    reader whether it is the kind of thing they want to read. */}
                <p className="mt-1.5 line-clamp-2 min-h-[2.6em] text-meta leading-relaxed text-ink">
                  {article.standfirst ?? article.summary}
                </p>

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
