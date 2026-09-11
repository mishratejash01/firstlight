import Link from "next/link";

import { SearchField } from "@/components/site/search-field";

/**
 * Search, from the flag.
 *
 * On a phone the dateline row has no room for a field, so the control
 * collapses to a link that opens the search page, which has its own field.
 * Wider screens get the suggesting field. The glyph is drawn inline rather
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
  return (
    <>
      <Link
        href="/search"
        aria-label="Search"
        className="text-ink hover:text-accent sm:hidden"
      >
        <Glyph />
      </Link>
      <div className="hidden sm:block">
        <SearchField variant="compact" />
      </div>
    </>
  );
}
