import Image from "next/image";
import Link from "next/link";

import { Byline } from "./byline";
import { Eyebrow } from "./eyebrow";
import type { ArticleCardData } from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * The splash. One per front page.
 *
 * Picture first, then the headline under it. This is the picture-led front:
 * the page opens on the photograph and the words follow, which is how most
 * modern papers lead — the image is what stops a reader scrolling, and the
 * headline is what holds them once it has.
 *
 * The trade-off is real and worth naming: the headline starts lower, so less
 * of it clears the fold on a short screen. That is the cost of leading with the
 * picture, and it is the reason the crop below matters so much.
 *
 * The picture is 16:9 for exactly that reason. At this column width a 3:2 crop
 * is some seventy pixels deeper, and every one of those pixels now sits between
 * the top of the page and the headline. The splash leads with a picture; it
 * still does not spend the whole fold on one.
 *
 * The image loads eagerly at high priority: it is the largest thing above the fold and the
 * page's LCP element, so it must not wait behind lazy loading.
 */
export function HeroStory({ article }: { article: ArticleCardData }) {
  const href = `/${article.categories.slug}/${article.slug}`;
  const dek = article.standfirst ?? article.summary;
  // Where a story carries both a standfirst and a summary, the splash runs the
  // second as well. It is the one story on the page with room for more than a
  // line, and the extra paragraph is also what brings the column down level
  // with the briefs beside it.
  const more =
    article.standfirst &&
    article.summary &&
    article.summary !== article.standfirst
      ? article.summary
      : null;

  return (
    <article className="group">
      {article.hero_image_url ? (
        <Link href={href} tabIndex={-1} aria-hidden="true">
          <div className="relative mb-5 aspect-[16/9] w-full overflow-hidden rounded-media bg-hairline">
            <Image
              src={
                cloudinaryImage(article.hero_image_url, "hero") ??
                article.hero_image_url
              }
              alt={article.hero_image_alt ?? ""}
              fill
              loading="eager"
              fetchPriority="high"
              sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) calc(100vw - 48px), 50vw"
              className="object-cover"
            />
          </div>
        </Link>
      ) : null}

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
    </article>
  );
}
