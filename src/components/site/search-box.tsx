"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SearchField } from "@/components/site/search-field";

/**
 * Search, from the flag.
 *
 * Closed it is a single glyph; clicking it opens the suggesting field in place.
 * A field standing open in the masthead costs about ninety pixels of a row that
 * also has to carry the dateline and the nameplate, and it spends them on a
 * control most readers of a front page never touch — they came to read what is
 * on it. The glyph keeps search one click away and gives the row back to the
 * paper's name.
 *
 * On a phone the control is a plain link to the search page, which has its own
 * full-width field. There is no room to expand into here, and a page with a
 * proper field beats a cramped one in the header.
 *
 * Escape and a click outside close it again. The glyph is drawn inline rather
 * than pulled from an icon set: one shape, no dependency.
 */
function Glyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.75 12.75 17 17" />
    </svg>
  );
}

export function SearchBox() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape from inside the field should land the reader back on the glyph
      // they opened it with, not at the top of the document.
      openerRef.current?.focus();
    };
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <>
      <Link
        href="/search"
        aria-label="Search"
        className="text-ink hover:text-accent sm:hidden"
      >
        <Glyph />
      </Link>

      <div ref={wrapRef} className="hidden sm:block">
        {open ? (
          <SearchField variant="compact" autoFocus />
        ) : (
          <button
            ref={openerRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Search"
            aria-expanded={false}
            className="block text-ink hover:text-accent"
          >
            <Glyph />
          </button>
        )}
      </div>
    </>
  );
}
