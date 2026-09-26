import Image from "next/image";
import Link from "next/link";
import { SectionMark } from "@/components/site/section-mark";

import type { ArticleCardData } from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * The opinion block on the front page.
 *
 * Opinion is not a subject, it is a genre, and the reader needs to know who is
 * arguing before they read what is argued. So the card is built around the
 * argument and the arguer: the line being taken, set apart in a warm panel
 * behind a quote mark, then the headline, then the columnist's face and name at
 * the foot. The warmth is the point — it marks the block as argument rather
 * than reporting before a word of it is read. No photograph of an event — a picture of a parliament tells you
 * nothing about whose opinion of it you are about to read.
 *
 * Which sections use this is a database question, not a component one. See the
 * `layout` column on `categories`.
 */
export function OpinionShelf({
  title,
  href,
  articles,
  iconUrl,
}: {
  title: string;
  href: string;
  articles: ArticleCardData[];
  iconUrl?: string | null;
}) {
  if (!articles.length) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-label flex items-center gap-2.5 text-section font-semibold text-ink">
          {iconUrl ? (
            <SectionMark src={iconUrl} className="h-[1.5em] w-[1.5em]" />
          ) : (
            <span
              aria-hidden="true"
              className="inline-block h-[1.15em] w-[5px] shrink-0 rounded-[2px] bg-accent"
            />
          )}
          <Link href={href} className="hover:text-accent">
            {title}
          </Link>
        </h2>
        <Link
          href={href}
          className="shrink-0 text-meta text-accent underline-offset-4 hover:underline"
        >
          More {title.toLowerCase()}
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {articles.slice(0, 4).map((article) => {
          const author = article.authors;
          const argument = article.standfirst ?? article.summary;

          return (
            <article key={article.id} className="group h-full">
              <Link
                href={`/${article.categories.slug}/${article.slug}`}
                className="flex h-full flex-col rounded-panel border border-hairline p-4"
              >
                {argument ? (
                  <div className="rounded-media bg-quote p-4">
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                      className="h-4 w-4 fill-accent"
                    >
                      <path d="M9.5 5.5C6.5 7 5 9.6 5 13v5.5h6.5V13H8.2c0-2.2.9-3.8 2.8-4.8l-1.5-2.7Zm9 0C15.5 7 14 9.6 14 13v5.5h6.5V13h-3.3c0-2.2.9-3.8 2.8-4.8l-1.5-2.7Z" />
                    </svg>
                    <p className="mt-2 text-meta leading-relaxed text-ink">
                      {argument}
                    </p>
                  </div>
                ) : null}

                <h3 className="mt-4 text-[1.15rem] leading-[1.3] text-ink group-hover:text-accent">
                  {article.headline}
                </h3>

                {/* mt-auto pins the byline to the foot, so the faces line up
                    across the row however long the headlines run above them. */}
                {author ? (
                  <div className="mt-auto flex items-center gap-3 pt-6">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-hairline">
                      {author.avatar_url ? (
                        <Image
                          src={
                            cloudinaryImage(author.avatar_url, "thumb") ??
                            author.avatar_url
                          }
                          alt={author.display_name}
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <span className="text-meta font-semibold text-ink">
                      {author.display_name}
                    </span>
                  </div>
                ) : null}
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
