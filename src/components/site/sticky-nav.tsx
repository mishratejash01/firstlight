"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * The sticky block that holds the sections and the breaking bar, and shrinks
 * once the reader has left the top of the page.
 *
 * At rest the strip carries a section mark above every name, which is what
 * makes the navigation readable at a glance on arrival. Held at the top of the
 * window for the length of a long story, that same strip is about a tenth of
 * the screen given over permanently to furniture. So the marks fold away on
 * scroll and the names close up into a single compact row.
 *
 * The nameplate is not sticky — it scrolls off with the rest of the flag — so
 * the shrunk state is also where the paper's name reappears, small, in the slot
 * on the left that is otherwise empty. Without it a reader thirty paragraphs
 * down has nothing on screen telling them whose site they are on.
 *
 * State is published as a data attribute rather than pushed down as props: the
 * strip itself is server-rendered inside a server component, so it cannot read
 * React state. CSS on a parent attribute can reach it; a prop cannot.
 *
 * The threshold is below the nameplate's height, and there is no hysteresis
 * band because the two states differ only in the height of the marks — a strip
 * that flickered between them would still be legible, and the reader would have
 * to be holding the scroll exactly at the boundary to see it.
 */
const SHRINK_AT = 140;

export function StickyNav({ children }: { children: ReactNode }) {
  const [shrunk, setShrunk] = useState(false);

  useEffect(() => {
    const onScroll = () => setShrunk(window.scrollY > SHRINK_AT);
    // Run once on mount: a reader arriving on a deep link, or returning to a
    // restored scroll position, is already past the threshold before the first
    // scroll event ever fires.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      data-shrunk={shrunk ? "true" : "false"}
      className="group/nav sticky top-0 z-40 border-b border-hairline bg-paper"
    >
      {children}
    </div>
  );
}
