"use client";

import Link from "next/link";
import { SectionMark } from "@/components/site/section-mark";
import { useEffect, useRef, useState } from "react";

import type { NavCategory } from "@/lib/queries/navigation";

/**
 * "More", and the panel of every other section behind it.
 *
 * The header can carry about eleven sections before it wraps into a second row
 * and stops reading as a masthead. A newsroom running fifteen or twenty still
 * needs all of them reachable, so the rest live one click away rather than
 * being dropped or allowed to overflow the page.
 *
 * On a phone there is no panel: "More" is a link to /sections, which lists them
 * as a page. A drawer on a narrow screen covers the whole display, which makes
 * it a page already — only one that is not in the history, cannot be linked to,
 * and can only be left through a small close button. The real page answers the
 * back gesture, which is how a reader on a phone expects to get out of
 * something.
 *
 * The panel lists sections alphabetically, not in the running order used by the
 * bar. A reader who opens this is looking for a named section rather than
 * browsing what the editors ranked highest, and alphabetical is the only order
 * you can search by eye without reading every entry.
 *
 * Closes on Escape and on a click outside, and returns focus to the button that
 * opened it. Body scrolling is locked while it is open, or the page behind
 * scrolls under the panel as soon as the pointer leaves it.
 */

/**
 * The mark, the word and the baseline rule, shared by the phone's link and the
 * desktop's button so the two cannot drift apart.
 */
function MoreFace() {
  return (
    <>
      {/* A mark of its own rather than an empty slot. The sections beside it
          all carry artwork; leaving this one blank made it read as the item
          whose picture had failed to load. Drawn as a grid of dots, in the
          ink rather than the section palette — this opens a menu, it is not
          a section, and it should not pretend to be one.

          The slot collapses with the section marks when the strip shrinks,
          width as well as height: left at its full size it would go on
          setting the width of the item with nothing visible inside it. */}
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-end justify-center overflow-hidden transition-[height,width] duration-200 group-data-[shrunk=true]/nav:h-0 group-data-[shrunk=true]/nav:w-0 motion-reduce:transition-none"
      >
        <svg
          viewBox="0 0 24 24"
          width="28"
          height="28"
          className="h-7 w-7 text-ink transition-opacity duration-100 group-hover/more:text-accent group-data-[shrunk=true]/nav:opacity-0 motion-reduce:transition-none"
          fill="currentColor"
        >
          <circle cx="5" cy="5" r="1.9" />
          <circle cx="12" cy="5" r="1.9" />
          <circle cx="19" cy="5" r="1.9" />
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
          <circle cx="5" cy="19" r="1.9" />
          <circle cx="12" cy="19" r="1.9" />
          <circle cx="19" cy="19" r="1.9" />
        </svg>
      </span>
      <span className="eyebrow font-label text-ink group-hover/more:text-accent">
        More
        {/* "More" alone says nothing out of context, to a screen reader
            listing the page's links or a search engine reading anchor text;
            the name it announces is "More sections". */}
        <span className="sr-only"> sections</span>
      </span>
      {/* Matches the rule that marks the active section, so "More" sits on
          the same baseline as the names beside it rather than riding up by
          two pixels. It can never be active itself — it is not a section. */}
      <span aria-hidden="true" className="h-[2px] w-full bg-transparent" />
    </>
  );
}

export function SectionsDrawer({ sections }: { sections: NavCategory[] }) {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      // Send focus back where it came from, or a keyboard reader is dropped at
      // the top of the document every time they close the panel.
      openerRef.current?.focus();
    };
  }, [open]);

  if (!sections.length) return null;

  return (
    <>
      {/* Phone: a link to the page. Rendered as a second element hidden by a
          breakpoint rather than chosen in JavaScript, so the correct control is
          in the first byte of HTML and there is no flash of the wrong one while
          the page hydrates. */}
      <Link
        href="/sections"
        className="group/more flex flex-col items-center gap-1.5 group-data-[shrunk=true]/nav:gap-0 sm:hidden"
      >
        <MoreFace />
      </Link>

      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="group/more hidden flex-col items-center gap-1.5 group-data-[shrunk=true]/nav:gap-0 sm:flex"
      >
        <MoreFace />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="All sections"
            tabIndex={-1}
            className="absolute inset-y-0 right-0 w-full max-w-sm overflow-y-auto bg-signal-soft p-6 outline-none"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-label text-section font-semibold text-ink">
                All sections
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-control p-1 text-muted hover:text-ink"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
                <span className="sr-only">Close</span>
              </button>
            </div>

            <ul className="mt-5 grid grid-cols-2 gap-3">
              {sections.map((section) => (
                <li key={section.slug}>
                  <Link
                    href={`/${section.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex h-full flex-col items-center gap-2 rounded-panel bg-paper p-4 text-center hover:text-accent"
                  >
                    <span className="flex h-8 items-end">
                      {section.icon_url ? (
                        <SectionMark src={section.icon_url} className="h-8 w-8" />
                      ) : null}
                    </span>
                    <span className="font-label text-meta font-semibold text-ink">
                      {section.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
