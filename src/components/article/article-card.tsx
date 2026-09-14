import Image from "next/image";
import Link from "next/link";

import { Byline } from "./byline";
import { Eyebrow } from "./eyebrow";
import type { ArticleCardData } from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * The standard story card used across shelves, section fronts and search.
 *
 * No border, no shadow, no radius, no hover lift. Cards are separated by
 * whitespace and, where they need it, a single hairline rule. The only thing
 * that moves on hover is the headline colour.
 *
 * Three sizes, because a page of identically weighted cards has no front page
 * in it. 'lead' anchors a section block, 'card' fills a grid, and 'list' is the
 * text-only entry that stacks in a column beside a lead — the same job the
 * short items down the side of a printed section page do.
 */
export function ArticleCard({
  article,
  variant = "card",
  showEyebrow = true,
  showDek = true,
}: {
  article: ArticleCardData;
  variant?: "lead" | "card" | "list";
  /** Off in a column that has to finish level with something beside it: the
   *  dek is the first thing worth losing, being the only part a reader can do
   *  without once the headline has told them what happened. */
  showDek?: boolean;
  /** Off where the container already names the section — inside a section
   *  block, or on a section front, where every card carries the same label and
   *  repeating it says nothing. A breaking story keeps its marker either way. */
  showEyebrow?: boolean;
}) {
  const href = `/${article.categories.slug}/${article.slug}`;
  const dek = article.standfirst ?? article.summary;
  const showImage = variant !== "list" && Boolean(article.hero_image_url);

  const headlineClass =
    variant === "lead"
      ? "text-[1.35rem] leading-[1.18] tracking-[-0.022em] text-ink"
      : variant === "card"
        ? "text-[1.15rem] leading-[1.22] text-ink sm:text-headline"
        : "text-[1.0625rem] leading-[1.28] text-ink";

  return (
    <article className="group">
      {showImage ? (
        <Link href={href} tabIndex={-1} aria-hidden="true">
          <div className="relative mb-3 aspect-[16/9] w-full overflow-hidden rounded-media bg-hairline">
            <Image
              src={
                cloudinaryImage(article.hero_image_url!, "card") ??
                article.hero_image_url!
              }
              alt={article.hero_image_alt ?? ""}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          </div>
        </Link>
      ) : null}

      {showEyebrow || article.is_breaking ? (
        <Eyebrow article={article} className="mb-1.5" />
      ) : null}

      <h3 className={headlineClass}>
        <Link href={href} className="group-hover:text-accent">
          {article.headline}
        </Link>
      </h3>

      {/* A list entry carries no dek. Its whole reason for existing is that a
 reader can take in six of them in the time one card takes. */}
      {dek && showDek && variant !== "list" ? (
        <p className="mt-1.5 text-meta leading-relaxed text-ink">{dek}</p>
      ) : null}

      <Byline
        author={article.authors}
        publishedAt={article.published_at}
        attributionLabel={article.attribution_label}
        className={variant === "list" ? "mt-1.5" : "mt-2"}
      />
    </article>
  );
}
