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

import { formatEditionDate, isReleased, shiftDate } from "@/lib/epaper/edition";
import { SITE_HOST, SITE_NAME } from "@/lib/site";

import {
  playPageTurn,
  setSound,
  soundOn,
  subscribeToSound,
} from "./page-sound";

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
 *
 * A turn makes the sound of a page turning (page-sound), which the reader can
 * switch off; and the whole edition can be downloaded as a watermarked PDF,
 * made in the browser (edition-pdf, loaded only when asked for).
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
  const [pdf, setPdf] = useState<{
    state: "idle" | "working" | "failed";
    progress: number;
  }>({
    state: "idle",
    progress: 0,
  });
  const sound = useSyncExternalStore(subscribeToSound, soundOn, () => true);
  const top = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const count = pages.length;

  const shown = useRef(0);

  const show = useCallback(
    (index: number, push = true, animate = true) => {
      if (index < 0 || index >= count || index === shown.current) return;
      setTurn(animate ? (index > shown.current ? "forward" : "back") : null);
      if (animate) playPageTurn();
      shown.current = index;
      setCurrent(index);
      if (push) window.history.pushState(null, "", `#page-${index + 1}`);
      // Back to the head of the sheet, below the sticky section strip.
      const box = top.current?.getBoundingClientRect();
      if (box && box.top < 0)
        window.scrollTo({ top: window.scrollY + box.top - 120 });
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
      if (target?.closest("input, textarea, select, [contenteditable='true']"))
        return;
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

  const download = async () => {
    const box = top.current;
    if (!box || pdf.state === "working") return;
    setPdf({ state: "working", progress: 0 });
    try {
      const { downloadEditionPdf } = await import("./edition-pdf");
      await downloadEditionPdf({
        sheets: [
          ...box.querySelectorAll<HTMLElement>(
            ".ep-desk > section > .ep-sheet",
          ),
        ],
        host: box,
        date,
        dateLabel: formatEditionDate(date),
        siteName: SITE_NAME,
        siteAddress: SITE_HOST.replace(/^www\./, ""),
        onProgress: (progress) => setPdf({ state: "working", progress }),
      });
      setPdf({ state: "idle", progress: 0 });
    } catch {
      setPdf({ state: "failed", progress: 0 });
    }
  };

  const tools = (
    <div className="ep-tools">
      <button
        type="button"
        className="ep-button ep-icon-button"
        aria-pressed={sound}
        aria-label={sound ? "Page sound on" : "Page sound off"}
        title={sound ? "Turn page sound off" : "Turn page sound on"}
        onClick={() => setSound(!sound)}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
          {sound ? (
            <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
          ) : (
            <path d="M16 9.5l5 5M21 9.5l-5 5" />
          )}
        </svg>
      </button>
      <button
        type="button"
        className="ep-button"
        onClick={download}
        disabled={pdf.state === "working"}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ep-button-icon"
        >
          <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />
        </svg>
        {pdf.state === "working" ? "Preparing PDF…" : "Download PDF"}
      </button>
      {pdf.state === "working" ? (
        <span
          className="ep-progress"
          role="progressbar"
          aria-label="Preparing the PDF"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pdf.progress * 100)}
        >
          <span style={{ width: `${Math.max(4, pdf.progress * 100)}%` }} />
        </span>
      ) : null}
      {pdf.state === "failed" ? (
        <span role="alert" className="ep-tools-note">
          The PDF could not be made. Please try again.
        </span>
      ) : null}
    </div>
  );

  const pager = (
    <div className="ep-pager">
      <button
        type="button"
        onClick={() => show(current - 1)}
        disabled={current === 0}
        className="ep-button"
      >
        Previous<span className="ep-wide">page</span>
      </button>
      <label className="ep-select">
        <span className="sr-only">Go to page</span>
        <select
          value={current}
          onChange={(event) => show(Number(event.target.value))}
        >
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
        Next<span className="ep-wide">page</span>
      </button>
    </div>
  );

  return (
    <div ref={top} className="ep-viewer">
      <div className="ep-toolbar">
        <nav className="ep-editions" aria-label="Editions">
          <Link href={`/epaper/${shiftDate(date, -1)}`}>Previous edition</Link>
          {nextOut ? (
            <Link href={`/epaper/${shiftDate(date, 1)}`}>Next edition</Link>
          ) : null}
        </nav>
        {tools}
        {pager}
      </div>

      {/* The sheets. Only the current one shows; the key restarts the fold
          each time the page changes. */}
      <div
        className="ep-desk"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
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
