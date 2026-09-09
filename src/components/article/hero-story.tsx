import Image from "next/image";
import Link from "next/link";

import { Byline } from "./byline";
import { Eyebrow } from "./eyebrow";
import type { ArticleCardData } from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * The splash. One per front page.
 *
 * On a phone the image leads and the headline follows at 34px. On a wide screen
 * the same markup gets a 54px headline across two thirds of the grid. A lead
 * story on a newspaper front is recognisable from across a room, and size is
 * the only thing doing that work here — there is no coloured label, no badge
 * and no rule around it.
 */
export function HeroStory({ article }: { article: ArticleCardData }) {
  const href = `/${article.categories.slug}/${article.slug}`;
  const dek = article.standfirst ?? article.summary;

  return (
    <article className="group">
      {article.hero_image_url ? (
        <Link href={href} tabIndex={-1} aria-hidden="true">
          <div className="relative mb-4 aspect-[16/9] w-full overflow-hidden rounded-media bg-hairline">
            <Image
              src={
                cloudinaryImage(article.hero_image_url, "hero") ??
                article.hero_image_url
              }
              alt={article.hero_image_alt ?? ""}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 66vw"
              className="object-cover"
            />
          </div>
        </Link>
      ) : null}

      <Eyebrow article={article} className="mb-2" />

      <h2 className="headline-lg text-hero leading-[1.04] text-ink sm:text-hero-lg lg:text-display">
        <Link href={href} className="group-hover:text-accent">
          {article.headline}
        </Link>
      </h2>

      {dek ? (
        <p className="mt-3 max-w-[44rem] text-lead text-muted">{dek}</p>
      ) : null}

      <Byline
        author={article.authors}
        publishedAt={article.published_at}
        attributionLabel={article.attribution_label}
        className="mt-3"
      />
    </article>
  );
}
