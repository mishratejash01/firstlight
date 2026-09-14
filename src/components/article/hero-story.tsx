import Image from "next/image";
import Link from "next/link";

import { Byline } from "./byline";
import { Eyebrow } from "./eyebrow";
import type { ArticleCardData } from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * The splash. One per front page.
 *
 * Headline first, picture second. Every serious front page in the world is
 * built that way: the reader is told what has happened before they are shown
 * it. Leading with a full-width photograph pushed the words below the fold and
 * made the page open on an image with no caption and no claim — handsome, and
 * silent about the news.
 *
 * The picture is 16:9 for the same reason: at this column width a 3:2 crop is
 * some seventy pixels deeper, which is a headline's worth of fold spent on the
 * same photograph. The splash still carries a picture; it just does not spend
 * the page on it.
 */
export function HeroStory({
  article,
  fillHeight = false,
}: {
  article: ArticleCardData;
  /** On the front page the splash shares a row with a taller column of
   *  stories. Rather than leave the gap under it, or pad the column with
   *  filler, the picture takes the slack and the two sides finish level — which
   *  is what a lead photograph does on a printed front. */
  fillHeight?: boolean;
}) {
  const href = `/${article.categories.slug}/${article.slug}`;
  const dek = article.standfirst ?? article.summary;
  // Where a story carries both a standfirst and a summary, the splash runs the
  // second as well. It is the one story on the page with room for more than a
  // line, and the extra paragraph is also what brings the column down level
  // with the briefs beside it.
  const more =
    article.standfirst && article.summary && article.summary !== article.standfirst
      ? article.summary
      : null;

  return (
    <article className={`group ${fillHeight ? "flex h-full flex-col" : ""}`}>
      <Eyebrow article={article} className="mb-2" />

      <h2 className="headline-lg text-hero leading-[1.03] text-ink sm:text-hero-lg lg:text-display">
        <Link href={href} className="group-hover:text-accent">
          {article.headline}
        </Link>
      </h2>

      {dek ? (
        <p className="mt-3 max-w-[42rem] text-lead text-ink">{dek}</p>
      ) : null}

      {more ? (
        <p className="mt-2.5 max-w-[42rem] text-body leading-relaxed text-muted">
          {more}
        </p>
      ) : null}

      <Byline
        author={article.authors}
        publishedAt={article.published_at}
        attributionLabel={article.attribution_label}
        className="mt-2.5"
      />

      {article.hero_image_url ? (
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className={fillHeight ? "mt-5 min-h-[18rem] flex-1" : ""}
        >
          <div
            className={`relative w-full overflow-hidden rounded-media bg-hairline ${
              fillHeight ? "h-full" : "mt-5 aspect-[16/9]"
            }`}
          >
            <Image
              src={
                cloudinaryImage(article.hero_image_url, "hero") ??
                article.hero_image_url
              }
              alt={article.hero_image_alt ?? ""}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </Link>
      ) : null}
    </article>
  );
}
