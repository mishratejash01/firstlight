import Image from "next/image";
import Link from "next/link";

import { BreakingTag } from "./breaking-tag";
import { Byline } from "./byline";
import type { ArticleCardData } from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * The splash. One per front page.
 *
 * On a phone the image leads and the headline follows at 34px. On a wide
 * screen the same markup gets a 48px headline and two thirds of the grid. The
 * hierarchy is carried by size and space, never by a coloured label.
 */
export function HeroStory({ article }: { article: ArticleCardData }) {
  const href = `/${article.categories.slug}/${article.slug}`;
  const dek = article.standfirst ?? article.summary;

  return (
    <article className="group">
      {article.hero_image_url ? (
        <Link href={href} tabIndex={-1} aria-hidden="true">
          <div className="relative mb-4 aspect-[16/9] w-full overflow-hidden bg-hairline">
            <Image
              src={cloudinaryImage(article.hero_image_url, "hero") ?? article.hero_image_url}
              alt={article.hero_image_alt ?? ""}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 66vw"
              className="object-cover"
            />
          </div>
        </Link>
      ) : null}

      <div className="flex items-center gap-3">
        {article.is_breaking ? <BreakingTag /> : null}
        <Link
          href={`/${article.categories.slug}`}
          className="text-meta text-accent hover:underline underline-offset-4"
        >
          {article.categories.name}
        </Link>
      </div>

      <h2 className="mt-2 font-serif text-hero leading-[1.08] text-ink lg:text-hero-lg">
        <Link href={href} className="group-hover:text-accent">
          {article.headline}
        </Link>
      </h2>

      {dek ? (
        <p className="mt-3 max-w-measure text-lead leading-relaxed text-muted">{dek}</p>
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
