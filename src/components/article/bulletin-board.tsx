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
 * No controls and no progress bar. It runs on its own and the picture and
 * headline are links to the story being shown; arrows on a rota that comes
 * round every few minutes were furniture nobody needed, and the count in the
 * corner says how far through it is without drawing a rule to say so. Nothing
 * is spoken here either — the voice lives on /bulletin, where a reader has
 * gone looking for it.
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
      className="rounded-panel bg-signal-deep px-6 py-7 text-paper sm:px-10 sm:py-9"
    >
      <div className="flex items-center justify-between gap-4">
        {/* The count is the real one, not the number fifty written down. On a
            thin day the board says what it actually has rather than promising
            fifty stories it cannot show. */}
        <p className="eyebrow font-label font-semibold text-paper">
          Top {count} bulletin
        </p>
        <span className="text-meta tabular-nums text-paper/70">
          {safeIndex + 1} of {count}
        </span>
      </div>

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
                sizes="(max-width: 1024px) 100vw, 55vw"
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
            <p className="mt-3 line-clamp-3 text-body leading-relaxed text-paper/85">
              {item.gist}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
