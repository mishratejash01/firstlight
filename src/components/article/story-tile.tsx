import Image from "next/image";
import Link from "next/link";

import type { ArticleCardData } from "@/lib/queries/articles";
import { cloudinaryImage } from "@/lib/media/transform";
import { formatDate } from "@/lib/format/datetime";

/**
 * The story tile used in the section blocks under the splash.
 *
 * One tinted panel holds the whole story: picture, headline, the opening of
 * the copy and the way in. That is what separates one story from the
 * next along the row — the page's own hairlines do the dividing everywhere
 * else, but a row of four photographs needs each picture grouped with its own
 * text, or the headlines read as floating between the pictures above them.
 *
 * The disc straddles the bottom-right corner of the picture and is painted in
 * the panel colour, not the page colour, so it reads as a circle cut out of the
 * photograph rather than a button dropped on top of it.
 *
 * The whole tile is one link. The arrow and the words under it are affordances,
 * not separate targets — a card with three links to the same story is three
 * chances to mis-tap and no extra use.
 */
/**
 * Trim to a word boundary so the extract and the link that follows it always
 * fit. A line-clamp would hide whichever of the two overflowed, and the one it
 * would hide is the link.
 */
function trim(text: string, limit = 110): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export function StoryTile({ article }: { article: ArticleCardData }) {
  const href = `/${article.categories.slug}/${article.slug}`;
  const extract = article.standfirst ?? article.summary;

  return (
    <article className="group h-full">
      <Link
        href={href}
        className="flex h-full flex-col rounded-panel bg-wash p-5"
      >
        <div className="relative">
          <div className="notch-br relative aspect-[4/3] w-full overflow-hidden rounded-media bg-hairline">
            {article.hero_image_url ? (
              <Image
                src={
                  cloudinaryImage(article.hero_image_url, "card") ??
                  article.hero_image_url
                }
                alt={article.hero_image_alt ?? ""}
                fill
                sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) 50vw, 25vw"
                className="object-cover"
              />
            ) : null}

            {/* No section tag: the block is already headed with its section,
                and repeating it on all four pictures says nothing. Breaking is
                not the section — it is the one thing worth marking here. */}
            {article.is_breaking ? (
              <span className="eyebrow absolute top-3 left-3 rounded-media bg-signal px-2 py-1 text-paper">
                Breaking
              </span>
            ) : null}
          </div>

          {/* Sits in the notch, on the bottom edge with its right side flush
              to the picture's. No disc of panel colour behind it any more — the
              gap around it is a real hole in the picture. Hovering moves it to
              the house blue rather than emptying it — the border is there in
              both states so nothing shifts by a pixel either way. */}
          <div className="absolute right-0 bottom-0 z-10 translate-y-1/2">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-ink bg-ink text-paper transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-paper">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17 17 7" />
                <path d="M8 7h9v9" />
              </svg>
            </span>
          </div>
        </div>

        {/* Clears the half of the arrow hanging below the picture. */}
        <h3 className="mt-8 text-[1.0625rem] leading-[1.28] text-ink group-hover:text-accent">
          {article.headline}
        </h3>

        {/* The way in runs on from the extract rather than sitting under it as
            a block of its own — it is the end of the sentence, not a button. */}
        <p className="mt-2 text-meta leading-relaxed text-ink">
          {extract ? `${trim(extract)} ` : null}
          <span className="text-ink underline underline-offset-2">
            View all
          </span>
        </p>

        {/* The section is named again down here, in the furniture rather than
            over the picture: weight separates it from the date beside it, so
            the pair reads as one line without needing a rule or a colour. */}
        <p className="mt-3 text-meta text-muted">
          <span className="font-label font-semibold text-ink">
            {article.categories.name}
          </span>
          {article.published_at ? (
            <>
              {" · "}
              <time dateTime={article.published_at}>
                {formatDate(article.published_at)}
              </time>
            </>
          ) : null}
        </p>
      </Link>
    </article>
  );
}
