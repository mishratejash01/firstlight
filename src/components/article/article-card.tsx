import Image from "next/image";
import Link from "next/link";

import { BreakingTag } from "./breaking-tag";
import { Byline } from "./byline";
import type { ArticleCardData } from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * The standard story card used across shelves, section fronts and search.
 *
 * No border, no shadow, no radius, no hover lift. Cards are separated by
 * whitespace and, where they need it, a single hairline rule. The only thing
 * that moves on hover is the headline colour.
 */
export function ArticleCard({
  article,
  showImage = true,
}: {
  article: ArticleCardData;
  showImage?: boolean;
}) {
  const href = `/${article.categories.slug}/${article.slug}`;
  const dek = article.standfirst ?? article.summary;

  return (
    <article className="group">
      {showImage && article.hero_image_url ? (
        <Link href={href} tabIndex={-1} aria-hidden="true">
          <div className="relative mb-3 aspect-[16/9] w-full overflow-hidden bg-hairline">
            <Image
              src={cloudinaryImage(article.hero_image_url, "card") ?? article.hero_image_url}
              alt={article.hero_image_alt ?? ""}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover"
            />
          </div>
        </Link>
      ) : null}

      {article.is_breaking ? (
        <div className="mb-1.5">
          <BreakingTag />
        </div>
      ) : null}

      <h3 className="font-serif text-[1.15rem] leading-snug text-ink sm:text-headline">
        <Link href={href} className="group-hover:text-accent">
          {article.headline}
        </Link>
      </h3>

      {dek ? <p className="mt-1.5 text-meta leading-relaxed text-muted">{dek}</p> : null}

      <Byline
        author={article.authors}
        publishedAt={article.published_at}
        attributionLabel={article.attribution_label}
        className="mt-2"
      />
    </article>
  );
}
