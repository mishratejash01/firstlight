/**
 * URL slug generation.
 *
 * Slugs are permanent once published — they are the address readers share and
 * search engines index — so they are generated from the headline at creation
 * and deliberately not regenerated when a headline is later edited. Renaming a
 * live URL to match a subedit is how you lose the ranking you just earned.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    // Strip diacritics so 'Zoë' becomes 'zoe' rather than dropping the letter.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Adds a short random suffix, for when the base slug is already taken. */
export function withUniqueSuffix(slug: string): string {
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${slug.slice(0, 74)}-${suffix}`;
}
