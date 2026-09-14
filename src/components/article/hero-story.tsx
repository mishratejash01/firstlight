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
export function HeroStory({ article }: { article: ArticleCardData }) {
  const href = `/${article.categories.slug}/${article.slug}`;
  const dek = article.standfirst ?? article.summary;

  return (
    <article className="group">
      <Eyebrow article={article} className="mb-2" />

      <h2 className="headline-lg text-hero leading-[1.03] text-ink sm:text-hero-lg lg:text-display">
        <Link href={href} className="group-hover:text-accent">
          {article.headline}
        </Link>
      </h2>

      {dek ? (
        <p className="mt-3 max-w-[42rem] text-lead text-ink">{dek}</p>
      ) : null}

      <Byline
        author={article.authors}
        publishedAt={article.published_at}
        attributionLabel={article.attribution_label}
        className="mt-2.5"
      />

      {article.hero_image_url ? (
        <Link href={href} tabIndex={-1} aria-hidden="true">
          <div className="relative mt-5 aspect-[16/9] w-full overflow-hidden rounded-media bg-hairline">
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
