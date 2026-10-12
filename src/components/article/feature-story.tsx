import Image from "next/image";
import Link from "next/link";

import { Byline } from "./byline";
import type { ArticleCardData } from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * One story given the full width partway down a front, as a photograph with
 * its headline set on it.
 *
 * A front that runs as one even grid after its lead reads as a feed, every
 * story worth the same. A printed section page changes pace as it goes down —
 * a strip of short items, then one story set big, then the shorter ones — and
 * this is the story set big: a wide picture (portrait on a phone, cinema-wide
 * on a desktop) with the words on its lower part. The dark shade under them is
 * only there so white type reads on any photograph. A story without a picture
 * runs as a large headline and standfirst instead.
 */
export function FeatureStory({ article }: { article: ArticleCardData }) {
  const href = `/${article.categories.slug}/${article.slug}`;
  const dek = article.standfirst ?? article.summary;

  if (!article.hero_image_url) {
    return (
      <article className="max-w-[52rem]">
        <h3 className="headline-lg text-[1.875rem] leading-[1.08] text-ink lg:text-[2.75rem]">
          <Link href={href}>{article.headline}</Link>
        </h3>
        {dek ? <p className="mt-3 font-dek text-lead text-ink">{dek}</p> : null}
        <Byline
          author={article.authors}
          publishedAt={article.published_at}
          attributionLabel={article.attribution_label}
          className="mt-3"
        />
      </article>
    );
  }

  return (
    <article className="relative aspect-[4/5] w-full overflow-hidden rounded-media bg-ink sm:aspect-[16/9] lg:aspect-[21/9]">
      <Link href={href} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
        <Image
          src={
            cloudinaryImage(article.hero_image_url, "hero") ??
            article.hero_image_url
          }
          alt={article.hero_image_alt ?? ""}
          fill
          sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) calc(100vw - 48px), 92vw"
          className="object-cover"
        />
      </Link>
      <div className="on-photo pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-5 pt-28 pb-6 sm:px-8 sm:pb-8 lg:px-12 lg:pb-11">
        <div className="max-w-[54rem]">
          <h3 className="headline-lg pointer-events-auto text-[1.75rem] leading-[1.08] text-ink sm:text-[2.25rem] lg:text-[2.875rem]">
            <Link href={href}>{article.headline}</Link>
          </h3>
          {dek ? (
            <p className="mt-3 hidden font-dek text-lead text-ink sm:block">{dek}</p>
          ) : null}
          <Byline
            author={article.authors}
            publishedAt={article.published_at}
            attributionLabel={article.attribution_label}
            className="pointer-events-auto mt-3"
          />
        </div>
      </div>
    </article>
  );
}
