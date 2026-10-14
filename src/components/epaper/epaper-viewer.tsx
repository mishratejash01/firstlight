"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { isReleased, shiftDate } from "@/lib/epaper/edition";

/**
 * Turns the pages of an edition.
 *
 * Every page is already in the document, server-rendered; this only decides
 * which one is showing. A page turn folds the new page in from the spine:
 * forward from the left edge, back from the right. Readers who ask their
 * device for reduced motion get the page without the fold.
 *
 * The page shown is kept in the address (#page-4), so a link to a page works,
 * the index and the "Inside" panel can be plain links, and the browser's back
 * button walks back through the pages turned.
 *
 * Whether the next edition is out depends on the time, so it is decided here
 * in the reader's browser, after the page has loaded; the edition page itself
 * is cached and must not carry it.
 */

type Turn = "forward" | "back" | null;

const SWIPE_PX = 60;

const noSubscription = () => () => {};

function pageFromHash(count: number): number | null {
  const match = /^#page-(\d+)$/.exec(window.location.hash);
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 1 && number <= count ? number - 1 : null;
}

export function EpaperViewer({
  date,
  titles,
  pages,
}: {
  date: string;
  titles: string[];
  pages: ReactNode[];
}) {
  const [current, setCurrent] = useState(0);
  const [turn, setTurn] = useState<Turn>(null);
  const top = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const count = pages.length;

  const shown = useRef(0);

  const show = useCallback(
    (index: number, push = true, animate = true) => {
      if (index < 0 || index >= count || index === shown.current) return;
      setTurn(animate ? (index > shown.current ? "forward" : "back") : null);
      shown.current = index;
      setCurrent(index);
      if (push) window.history.pushState(null, "", `#page-${index + 1}`);
      // Back to the head of the sheet, below the sticky section strip.
      const box = top.current?.getBoundingClientRect();
      if (box && box.top < 0) window.scrollTo({ top: window.scrollY + box.top - 120 });
    },
    [count],
  );

  // The page in the address on arrival, and whenever a link or the back
  // button changes it.
  useEffect(() => {
    // No page in the address (the reader came back past the first turn)
    // means the front page.
    const sync = () => show(pageFromHash(count) ?? 0, false);
    // The page a reader arrives on is simply there; only a turn folds.
    show(pageFromHash(count) ?? 0, false, false);
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [count, show]);

  // Read from the reader's clock once in the browser; on the server, and in
  // the cached page, the next edition is never assumed to be out.
  const nextOut = useSyncExternalStore(
    noSubscription,
    () => isReleased(shiftDate(date, 1)),
    () => false,
  );

  // Arrow keys turn the page, unless the reader is typing somewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowRight") show(current + 1);
      if (event.key === "ArrowLeft") show(current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, show]);

  const onTouchStart = (event: React.TouchEvent) => {
    // A swipe across a puzzle is the reader playing it, not turning the page.
    if ((event.target as HTMLElement).closest("[data-no-swipe]")) {
      touchStart.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    show(dx < 0 ? current + 1 : current - 1);
  };

  const pager = (
    <div className="ep-pager">
      <button type="button" onClick={() => show(current - 1)} disabled={current === 0} className="ep-button">
        Previous<span className="ep-wide"> page</span>
      </button>
      <label className="ep-select">
        <span className="sr-only">Go to page</span>
        <select value={current} onChange={(event) => show(Number(event.target.value))}>
          {titles.map((title, index) => (
            <option key={index} value={index}>
              {index + 1}. {title}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => show(current + 1)}
        disabled={current === count - 1}
        className="ep-button ep-button-solid"
      >
        Next<span className="ep-wide"> page</span>
      </button>
    </div>
  );

  return (
    <div ref={top} className="ep-viewer">
      <div className="ep-toolbar">
        <nav className="ep-editions" aria-label="Editions">
          <Link href={`/epaper/${shiftDate(date, -1)}`}>Previous edition</Link>
          {nextOut ? <Link href={`/epaper/${shiftDate(date, 1)}`}>Next edition</Link> : null}
        </nav>
        {pager}
      </div>

      {/* The sheets. Only the current one shows; the key restarts the fold
          each time the page changes. */}
      <div className="ep-desk" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {pages.map((page, index) => (
          <section
            key={index === current ? `shown-${index}` : index}
            id={`sheet-${index + 1}`}
            aria-label={`Page ${index + 1}: ${titles[index]}`}
            hidden={index !== current}
            className={
              index === current && turn === "forward"
                ? "ep-turn-forward"
                : index === current && turn === "back"
                  ? "ep-turn-back"
                  : undefined
            }
          >
            {page}
          </section>
        ))}
      </div>

    </div>
  );
}
