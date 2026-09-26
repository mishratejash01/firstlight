/**
 * URL slug generation.
 *
 * Slugs are permanent once published — they are the address readers share and
 * search engines index — so they are generated from the headline at creation
 * and deliberately not regenerated when a headline is later edited. Renaming a
 * live URL to match a subedit is how you lose the ranking you just earned.
 */

/** Longest slug, in characters: room for a descriptive headline's key words. */
const MAX_SLUG_LENGTH = 80;

/**
 * Shortens a slug to at most `max` characters at a word boundary, so an
 * address never ends in half a word ("...after-critics-liken-imagery-to-kkk-and-lync").
 * Only a single word longer than the limit is cut through.
 */
function trimToWord(slug: string, max: number): string {
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max + 1);
  const boundary = cut.lastIndexOf("-");
  return (boundary > 0 ? cut.slice(0, boundary) : slug.slice(0, max)).replace(/-+$/g, "");
}

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    // Strip diacritics so 'Zoë' becomes 'zoe' rather than dropping the letter.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return trimToWord(slug, MAX_SLUG_LENGTH);
}

/** Adds a short random suffix, for when the base slug is already taken. */
export function withUniqueSuffix(slug: string): string {
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${trimToWord(slug, MAX_SLUG_LENGTH - suffix.length - 1)}-${suffix}`;
}
