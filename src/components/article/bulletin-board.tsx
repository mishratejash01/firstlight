"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cloudinaryImage } from "@/lib/media/transform";

/**
 * The bulletin board: the day's stories, one at a time, on the paper's red.
 *
 * A picture, a headline and enough of the story to know what happened and to
 * whom — then the next. A headline on its own turned out to be too little: a
 * reader could see that something had happened without learning where or who
 * it happened to, which is a strap line rather than a bulletin. The standfirst
 * under it is the difference between noticing a story and understanding it.
 *
 * Nothing around it: no arrows, no progress bar, no position counter. It runs
 * on its own and the picture and headline are links to the story being shown.
 * All of that was furniture telling a reader about the mechanism rather than
 * about the news, on a panel whose whole job is to carry one story at a time.
 * Nothing is spoken here either — the voice lives on /bulletin, where a reader
 * has gone looking for it.
 *
 * The picture is a true 16:9 frame, drawn whether or not the story has art, so
 * the panel is the same height on every story and the page below it never
 * moves.
 */

export type BoardItem = {
  id: string;
  headline: string;
  /** A line or two of the story: where it happened, and to whom. */
  gist: string | null;
  href: string;
  imageUrl: string | null;
  imageAlt: string | null;
};

/**
 * How long a story holds the board.
 *
 * Longer than the headline-only version ran. There is a picture to take in and
 * two lines to read now, and four and a half seconds was enough for neither.
 */
const HOLD_MS = 6500;

export function BulletinBoard({ items }: { items: BoardItem[] }) {
  const [index, setIndex] = useState(0);
  const count = items.length;
  const safeIndex = count ? index % count : 0;

  useEffect(() => {
    if (count < 2) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, HOLD_MS);
    return () => clearInterval(timer);
  }, [count]);

  if (!count) return null;

  const item = items[safeIndex];

  return (
    <section
      aria-label="Today's stories"
      className="rounded-panel bg-signal px-6 py-7 text-paper sm:px-10 sm:py-9"
    >
      {/* The segment's own mark rather than type, laid straight on the ground.
          The white lettering and its dark outline carry it; the map of India
          behind them is drawn in very nearly this panel's own red, so it reads
          as a tonal shape rather than as artwork. Replacing the mark with a
          version whose map is white would bring it back.

          Given a real height rather than a token one: it carries two stacked
          lines of lettering, and below about fifty pixels the lower one stops
          being legible. The alt text carries the words in the artwork, so the
          segment is named for a reader who cannot see it. */}
      <Image
        src="/brand/top-50-bulletin.png"
        alt="Top 50 Bulletin"
        width={900}
        height={426}
        className="h-14 w-auto sm:h-[4.75rem]"
      />

      {/* Keyed on the story, so React replaces the block and the fade replays.
          The grid, the frame and the rule outside it stay put; only what is in
          them changes. */}
      <div
        key={item.id}
        className="board-item mt-6 grid items-center gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10"
      >
        <Link href={item.href} tabIndex={-1} aria-hidden="true">
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-media bg-paper/10">
            {item.imageUrl ? (
              <Image
                src={cloudinaryImage(item.imageUrl, "card") ?? item.imageUrl}
                alt={item.imageAlt ?? ""}
                fill
                sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) calc(100vw - 48px), 55vw"
                className="object-cover"
              />
            ) : null}
          </div>
        </Link>

        <div>
          <h2 className="text-[1.375rem] leading-[1.22] font-semibold text-pretty sm:text-[1.75rem]">
            <Link
              href={item.href}
              className="underline-offset-[6px] hover:underline"
            >
              {item.headline}
            </Link>
          </h2>

          {item.gist ? (
            // Three lines is the most that reads as a bulletin rather than as
            // the top of an article. Clamped rather than trimmed server-side so
            // a short standfirst is never padded and a long one never reflows
            // the panel.
            <p className="mt-3 line-clamp-3 text-body leading-relaxed text-paper/90">
              {item.gist}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
