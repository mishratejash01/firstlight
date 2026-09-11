import Link from "next/link";

/**
 * Search, from the flag.
 *
 * A plain GET form to /search, so it works before hydration and without
 * JavaScript. On a phone the dateline row has no room for a field, so the
 * control collapses to a link that opens the search page, which has its own
 * field. The glyph is drawn inline rather than pulled from an icon set: one
 * shape, no dependency.
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

      <form
        action="/search"
        method="get"
        role="search"
        className="hidden items-center gap-2 border-b border-hairline pb-0.5 sm:flex"
      >
        <label htmlFor="site-search" className="sr-only">
          Search
        </label>
        <input
          id="site-search"
          type="search"
          name="q"
          placeholder="Search"
          autoComplete="off"
          className="w-36 bg-transparent text-meta text-ink placeholder:text-muted focus:outline-none"
        />
        <button type="submit" aria-label="Search" className="text-ink hover:text-accent">
          <Glyph />
        </button>
      </form>
    </>
  );
}
