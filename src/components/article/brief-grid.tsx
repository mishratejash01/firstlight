import Image from "next/image";
import Link from "next/link";

import type { ArticleCardData } from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";
import { formatTimeAgo } from "@/lib/format/datetime";

/**
 * The dense grid of briefs that runs beside the splash.
 *
 * Two columns of short entries rather than one long list: the splash is a
 * single story given a lot of room, and what belongs next to it is the opposite
 * — many stories, each given a little. Together they say "one big thing
 * happened, and here is everything else", which is the whole argument of a
 * front page.
 *
 * Section label, headline, and when it was filed. No standfirst: at this size
 * the dek is the first thing worth losing, being the only part a reader can do
 * without once the headline has told them what happened, and dropping it is
 * what lets this column finish level with the splash.
 *
 * The first brief runs the full width with its picture beside the headline;
 * the rest pair up beneath it. Not every entry has to be half a column — a
 * uniform two-column block wastes the width on short headlines and gives the
 * lead brief no more weight than the ninth.
 */
function Meta({ article }: { article: ArticleCardData }) {
  return (
    <>
      <p className="font-label text-kicker font-semibold text-accent">
        {article.categories.name}
      </p>
      <h3 className="mt-1 text-[1rem] leading-[1.28] text-ink group-hover:text-accent">
        <Link href={`/${article.categories.slug}/${article.slug}`}>
          {article.headline}
        </Link>
      </h3>
      {article.published_at ? (
        <p className="mt-1.5 text-meta text-muted">
          <time dateTime={article.published_at}>
            {formatTimeAgo(article.published_at)}
          </time>
        </p>
      ) : null}
    </>
  );
}

export function BriefGrid({ articles }: { articles: ArticleCardData[] }) {
  if (!articles.length) return null;

  const [first, ...rest] = articles;

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-6">
      <article className="group col-span-2 flex gap-4">
        {first.hero_image_url ? (
          <Link
            href={`/${first.categories.slug}/${first.slug}`}
            tabIndex={-1}
            aria-hidden="true"
            className="shrink-0"
          >
            <div className="relative aspect-[4/3] w-36 overflow-hidden rounded-media bg-hairline sm:w-44">
              <Image
                src={
                  cloudinaryImage(first.hero_image_url, "card") ??
                  first.hero_image_url
                }
                alt={first.hero_image_alt ?? ""}
                fill
                sizes="176px"
                className="object-cover"
              />
            </div>
          </Link>
        ) : null}
        <div className="min-w-0">
          <Meta article={first} />
        </div>
      </article>

      {rest.map((article) => (
        <article key={article.id} className="group">
          <Meta article={article} />
        </article>
      ))}
    </div>
  );
}
