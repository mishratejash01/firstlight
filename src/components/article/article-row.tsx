import Image from "next/image";
import Link from "next/link";

import { Byline } from "./byline";
import { Eyebrow } from "./eyebrow";
import type { ArticleCardData } from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * A story as a row: headline on the left, small picture on the right.
 *
 * This is the shape a wire service uses everywhere it has to show a lot of
 * stories in a little height — the latest column, the tail of a section. A grid
 * of picture-on-top cards spends most of its space on photographs, which is
 * right for four stories and wrong for twenty.
 *
 * The thumbnail is fixed-width and shrink-proof so every row in a column lines
 * up down the same edge, and a story with no picture simply gives its width to
 * the headline instead of leaving a hole.
 */
export function ArticleRow({
  article,
  showEyebrow = true,
}: {
  article: ArticleCardData;
  showEyebrow?: boolean;
}) {
  const href = `/${article.categories.slug}/${article.slug}`;

  return (
    <article className="group flex items-start gap-4">
      <div className="min-w-0 flex-1">
        {showEyebrow ? <Eyebrow article={article} className="mb-1.5" /> : null}
        <h3 className="text-[1.0625rem] leading-[1.3] text-ink">
          <Link href={href} className="group-hover:text-accent">
            {article.headline}
          </Link>
        </h3>
        <Byline
          author={article.authors}
          publishedAt={article.published_at}
          attributionLabel={article.attribution_label}
          className="mt-1.5"
        />
      </div>

      {/* The slot is held open whether or not there is a picture, so every
          headline in a column wraps at the same width and the rows share one
          right edge. A story filed without art gives up the space rather than
          taking it, which is what made the column look ragged before. */}
      {article.hero_image_url ? (
        <Link href={href} tabIndex={-1} aria-hidden="true" className="shrink-0">
          <div className="relative aspect-[4/3] w-[5.5rem] overflow-hidden rounded-media bg-hairline sm:w-24">
            <Image
              src={
                cloudinaryImage(article.hero_image_url, "thumb") ??
                article.hero_image_url
              }
              alt={article.hero_image_alt ?? ""}
              fill
              sizes="96px"
              className="object-cover"
            />
          </div>
        </Link>
      ) : (
        <div aria-hidden="true" className="w-[5.5rem] shrink-0 sm:w-24" />
      )}
    </article>
  );
}
