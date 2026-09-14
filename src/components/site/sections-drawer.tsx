"use client";

import Image from "next/image";
import Link from "next/link";
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
 * On a wide screen the panel does not cover the page: it takes its width off
 * the body and the page reflows into what is left, so everything stays visible
 * and nothing has to be dismissed to get back to what was being read. Below
 * that width there is nothing to give up — taking 22rem off a tablet leaves a
 * column too narrow to reflow into — so the panel covers the page instead, over
 * a scrim, the way it did before. Which of the two is in force is decided here
 * and not in the stylesheet, because the same answer also decides whether the
 * panel is a modal and whether the page behind it should stop scrolling.
 *
 * The panel lists sections alphabetically, not in the running order used by the
 * bar. A reader who opens this is looking for a named section rather than
 * browsing what the editors ranked highest, and alphabetical is the only order
 * you can search by eye without reading every entry.
 *
 * Closes on Escape and on a click outside, and returns focus to the button that
 * opened it.
 */
const PUSHES_AT = "(min-width: 1024px)";

export function SectionsDrawer({ sections }: { sections: NavCategory[] }) {
  const [open, setOpen] = useState(false);
  const [pushes, setPushes] = useState(false);
  const [top, setTop] = useState(0);
  const openerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia(PUSHES_AT);
    const sync = () => setPushes(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // The panel opens under the section bar, not across it: the navigation is
  // what the reader is using when they open this, and covering it would hide
  // the row they just clicked. The bar is sticky and changes height as the
  // page moves — it shrinks once scrolled, and carries the breaking strip only
  // on some pages — so its lower edge is measured rather than assumed, and
  // re-measured while the panel is open.
  useEffect(() => {
    if (!open) return;

    const bar = document.querySelector("[data-sticky-nav]");
    if (!bar) return;

    const measure = () => {
      setTop(Math.max(0, Math.round(bar.getBoundingClientRect().bottom)));
    };
    measure();

    // The bar's own height is the thing that moves most here, and it moves for
    // reasons no scroll or resize event reports: opening this panel narrows the
    // body, which reflows the section strip onto a second row and makes the bar
    // taller — after the first measurement, and while the body's width is still
    // animating. Watching the element itself catches all of it.
    const observer = new ResizeObserver(measure);
    observer.observe(bar);

    // Size is not the whole story: the bar is sticky, so its position changes
    // on scroll while its height stays put.
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    // A click anywhere off the panel closes it. When the panel is covering the
    // page that click lands on the scrim; when it has made room for itself
    // there is no scrim and the click lands on the page, which is the point —
    // going back to reading should not need the close button found first.
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (openerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);

    // Narrowing the body is a document-wide effect, so it is applied to the
    // document rather than to anything this component owns.
    document.documentElement.classList.add("sections-open");

    // Only lock scrolling when the panel is covering the page. When it has
    // made room for itself the page behind is still readable, and freezing it
    // would stop a reader scrolling the very content the panel just revealed.
    const previousOverflow = document.body.style.overflow;
    if (!pushes) document.body.style.overflow = "hidden";

    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.documentElement.classList.remove("sections-open");
      if (!pushes) document.body.style.overflow = previousOverflow;
      // Send focus back where it came from, or a keyboard reader is dropped at
      // the top of the document every time they close the panel.
      openerRef.current?.focus();
    };
  }, [open, pushes]);

  if (!sections.length) return null;

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="group/more flex flex-col items-center gap-1.5 group-data-[shrunk=true]/nav:gap-0"
      >
        {/* A mark of its own rather than an empty slot. The sections beside it
            all carry artwork; leaving this one blank made it read as the item
            whose picture had failed to load. Drawn as a grid of dots, in the
            ink rather than the section palette — this opens a menu, it is not
            a section, and it should not pretend to be one.

            The slot collapses with the section marks when the strip shrinks. */}
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-end justify-center overflow-hidden transition-[height,width] duration-200 group-data-[shrunk=true]/nav:h-0 group-data-[shrunk=true]/nav:w-0 motion-reduce:transition-none"
        >
          <svg
            viewBox="0 0 24 24"
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
        </span>
        {/* Matches the rule that marks the active section, so "More" sits on
            the same baseline as the names beside it rather than riding up by
            two pixels. It can never be active itself — it is not a section. */}
        <span aria-hidden="true" className="h-[2px] w-full bg-transparent" />
      </button>

      {open ? (
        <div
          className="fixed right-0 bottom-0 left-0 z-[60] pointer-events-none"
          style={{ top }}
        >
          {/* Only when the panel is covering the page. Where it has made room
              for itself there is nothing to dim: the page beside it is meant
              to stay readable, and a scrim over it would say the opposite. */}
          {!pushes ? (
            <div
              className="absolute inset-0 bg-ink/40 pointer-events-auto"
              aria-hidden="true"
            />
          ) : null}

          <div
            ref={panelRef}
            role="dialog"
            // A modal only while it covers the page. Announcing it as one while
            // the rest of the page is still visible and usable would tell a
            // screen reader the opposite of what is on screen.
            aria-modal={pushes ? undefined : true}
            aria-label="All sections"
            tabIndex={-1}
            className="pointer-events-auto absolute inset-y-0 right-0 flex w-full max-w-[22rem] flex-col overflow-y-auto border-l border-hairline bg-signal-soft p-6 outline-none"
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
                          width={64}
                          height={64}
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
