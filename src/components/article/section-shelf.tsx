import Link from "next/link";
import { SectionMark } from "@/components/site/section-mark";

import { StoryTile } from "./story-tile";
import type { ArticleCardData } from "@/lib/queries/articles";

/**
 * One section's block on the front page: a row of equal story tiles.
 *
 * The heavy rule above the label is the only mark separating one section from
 * the next — no card, no panel, no tint, no column rules. Every story in the
 * row carries the same weight, so the section reads as a shelf of what is
 * there rather than as an argument about which of them matters most; the
 * splash above has already made that argument for the page.
 */
export function SectionShelf({
  title,
  href,
  articles,
  iconUrl,
}: {
  title: string;
  href: string;
  articles: ArticleCardData[];
  iconUrl?: string | null;
}) {
  if (!articles.length) return null;

  // Three across on a wide screen. Four made each picture too small to carry a
  // photograph once the page shell narrowed to three quarters of the window.
  const tiles = articles.slice(0, 3);

  return (
    <section>
      <SectionHeader title={title} href={href} iconUrl={iconUrl} />

      <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((article) => (
          <StoryTile key={article.id} article={article} />
        ))}
      </div>
    </section>
  );
}

/**
 * The section label: a vertical bar in the house blue with the name beside it.
 *
 * The bar replaces the heavy rule that used to run above each block. A rule
 * spans the page and reads as a divider between two things; a bar sits against
 * the words and reads as a marker belonging to them, which is what a section
 * label is. Sentence case, not capitals — the name is a word, not a tag.
 */
function SectionHeader({
  title,
  href,
  iconUrl,
}: {
  title: string;
  href: string;
  iconUrl?: string | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="font-label flex items-center gap-2.5 text-section font-semibold text-ink">
        {/* The mark is the marker. Where a section has one it stands in for the
            bar rather than queueing up behind it — a bar, a picture and a name
            in a row is three things introducing one section. Hidden from screen
            readers, since the name is written out beside it. */}
        {iconUrl ? (
          <SectionMark src={iconUrl} className="h-[1.5em] w-[1.5em]" />
        ) : (
          <span
            aria-hidden="true"
            className="inline-block h-[1.15em] w-[5px] shrink-0 rounded-[2px] bg-accent"
          />
        )}
        <Link href={href} className="hover:text-accent">
          {title}
        </Link>
      </h2>
      <Link
        href={href}
        className="shrink-0 text-meta text-accent underline-offset-4 hover:underline"
      >
        More {title.toLowerCase()}
      </Link>
    </div>
  );
}
