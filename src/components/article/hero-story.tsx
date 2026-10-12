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
export function HeroStory({
  article,
  size = "front",
}: {
  article: ArticleCardData;
  /** "column" where the splash shares the row with a column either side (a
   *  section front): the headline steps down a size there, since at the full
   *  display size it ran to four and five lines in the narrower column. */
  size?: "front" | "column";
}) {
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

  // On the front page the splash is a photograph with its headline set on it,
  // the way a magazine cover or a weekend front runs its lead: the picture is
  // tall (portrait on a phone, 4:3 on a wide screen) and the words sit on its
  // lower part, over a dark shade that is there only so white type can be read
  // on any photograph. Setting the headline on the picture is also what lets
  // the picture grow without pushing the headline below the fold. A story
  // without a picture falls through to the plain layout below.
  //
  // On a wide screen the picture has no fixed shape: it takes whatever height
  // the column has left after the standfirst, so the splash always finishes
  // level with the briefs beside it. A fixed 4:3 left a band of white under
  // the splash whose depth changed with every headline in the other column.
  if (size === "front" && article.hero_image_url) {
    return (
      <article className="group flex flex-1 flex-col">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-media bg-ink sm:aspect-[3/2] lg:aspect-auto lg:min-h-[30rem] lg:flex-1">
          <Link href={href} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
            <Image
              src={
                cloudinaryImage(article.hero_image_url, "hero") ??
                article.hero_image_url
              }
              alt={article.hero_image_alt ?? ""}
              fill
              loading="eager"
              fetchPriority="high"
              sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) calc(100vw - 48px), 62vw"
              className="object-cover"
            />
          </Link>
          <div className="on-photo pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-5 pt-28 pb-6 sm:px-8 sm:pb-8 lg:px-10 lg:pb-10">
            <Eyebrow article={article} className="mb-2" />
            <h2 className="headline-lg pointer-events-auto text-[1.875rem] leading-[1.05] text-ink sm:text-hero-lg 2xl:text-display">
              <Link href={href}>{article.headline}</Link>
            </h2>
          </div>
        </div>

        {dek ? (
          <p className="mt-4 max-w-[46rem] font-dek text-lead text-ink">{dek}</p>
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

  return (
    <article className="group">
      {article.hero_image_url ? (
        <Link href={href} tabIndex={-1} aria-hidden="true">
          <div
            className={`relative mb-5 w-full overflow-hidden rounded-media bg-hairline ${
              size === "column" ? "aspect-[16/9] xl:aspect-[4/3]" : "aspect-[16/9]"
            }`}
          >
            <Image
              src={
                cloudinaryImage(article.hero_image_url, "hero") ??
                article.hero_image_url
              }
              alt={article.hero_image_alt ?? ""}
              fill
              loading="eager"
              fetchPriority="high"
              sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) calc(100vw - 48px), 62vw"
              className="object-cover"
            />
          </div>
        </Link>
      ) : null}

      <Eyebrow article={article} className="mb-2" />

      <h2
        className={`headline-lg text-hero leading-[1.03] text-ink sm:text-hero-lg ${
          size === "column" ? "lg:text-[2.5rem] 2xl:text-hero-lg" : "lg:text-display"
        }`}
      >
        <Link href={href}>
          {article.headline}
        </Link>
      </h2>

      {dek ? (
        <p className="mt-3 max-w-[42rem] font-dek text-lead text-ink">{dek}</p>
      ) : null}

      {more ? (
        <p className="mt-2.5 max-w-[42rem] font-dek text-body leading-relaxed text-muted">
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
