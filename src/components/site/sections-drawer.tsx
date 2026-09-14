"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { NavCategory } from "@/lib/queries/navigation";

/**
 * "More", and the panel of every other section behind it.
 *
 * The header can carry about eight sections before it wraps into a second row
 * and stops reading as a masthead. A newsroom running fifteen or twenty still
 * needs all of them reachable, so the rest live one click away rather than
 * being dropped or allowed to overflow the page.
 *
 * The panel lists them alphabetically, not in the running order used by the
 * bar. A reader who opens this is looking for a named section rather than
 * browsing what the editors ranked highest, and alphabetical is the only order
 * you can search by eye without reading every entry.
 *
 * Closes on Escape and on a click outside, and returns focus to the button that
 * opened it. Body scrolling is locked while it is open, or the page behind
 * scrolls under the panel as soon as the pointer leaves it.
 */
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
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex flex-col items-center gap-1.5"
      >
        {/* The slot stays even though nothing sits in it, so "More" lines up
            on the same baseline as the section names beside it. */}
        <span aria-hidden="true" className="flex h-6 items-end" />
        <span className="eyebrow font-label text-ink hover:text-accent">
          More
        </span>
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
                        <Image
                          src={section.icon_url}
                          alt=""
                          aria-hidden="true"
                          width={40}
                          height={40}
                          className="h-8 w-8 object-contain"
                        />
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
