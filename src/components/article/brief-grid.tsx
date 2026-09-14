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
function Meta({
  article,
  iconUrl,
  large = false,
}: {
  article: ArticleCardData;
  iconUrl?: string | null;
  large?: boolean;
}) {
  return (
    <>
      {/* text-pretty, not the inherited balance. Balancing evens the line
          lengths by pulling the whole block in from the column edge, which on
          the lead brief reads as a narrow headline sitting in a wide space
          under a full-width picture. */}
      <h3
        className={`text-pretty leading-[1.25] text-ink group-hover:text-accent ${
          large ? "text-[1.25rem]" : "text-[1rem]"
        }`}
      >
        <Link href={`/${article.categories.slug}/${article.slug}`}>
          {article.headline}
        </Link>
      </h3>

      {/* Section and time on one line under the headline, the mark beside the
          section it belongs to. Below rather than above: the headline is what
          the reader came for, and the label is what they check afterwards to
          place it. */}
      <p className="mt-2 flex items-center gap-1.5 text-meta text-muted">
        {iconUrl ? (
          <Image
            src={iconUrl}
            alt=""
            aria-hidden="true"
            width={24}
            height={24}
            className="h-4 w-4 shrink-0 object-contain"
          />
        ) : null}
        <span className="text-ink">{article.categories.name}</span>
        {article.published_at ? (
          <>
            <span aria-hidden="true">|</span>
            <time dateTime={article.published_at}>
              {formatTimeAgo(article.published_at)}
            </time>
          </>
        ) : null}
      </p>
    </>
  );
}

export function BriefGrid({
  articles,
  iconBySlug,
}: {
  articles: ArticleCardData[];
  /** Section marks, keyed by slug; a section without one simply shows none. */
  iconBySlug?: Map<string, string | null>;
}) {
  if (!articles.length) return null;

  const [first, ...rest] = articles;

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-6">
      {/* The lead brief takes the full width with its picture above the
          headline — a proper second story rather than a thumbnail with a
          caption beside it, which left a ragged hole under the picture. */}
      <article className="group col-span-2">
        {first.hero_image_url ? (
          <Link
            href={`/${first.categories.slug}/${first.slug}`}
            tabIndex={-1}
            aria-hidden="true"
          >
            <div className="relative mb-3 aspect-[16/9] w-full overflow-hidden rounded-media bg-hairline">
              <Image
                src={
                  cloudinaryImage(first.hero_image_url, "card") ??
                  first.hero_image_url
                }
                alt={first.hero_image_alt ?? ""}
                fill
                sizes="(max-width: 1024px) 100vw, 480px"
                className="object-cover"
              />
            </div>
          </Link>
        ) : null}
        <Meta
          article={first}
          iconUrl={iconBySlug?.get(first.categories.slug)}
          large
        />
      </article>

      {/* A rule above each pair gives the stack a rhythm; without it eight
          identical text blocks read as one undifferentiated dump. */}
      {rest.map((article, index) => (
        <article
          key={article.id}
          className={`group ${index > 1 ? "border-t border-hairline pt-5" : ""}`}
        >
          <Meta
            article={article}
            iconUrl={iconBySlug?.get(article.categories.slug)}
          />
        </article>
      ))}
    </div>
  );
}
