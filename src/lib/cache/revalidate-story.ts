import "server-only";

import { revalidatePath } from "next/cache";

import { purgeEdge } from "./cloudflare";

/**
 * Rebuild a story's cached page now, with its section front and the front
 * page, after the desk changes it.
 *
 * Story pages are cached for an hour (see the article route), which is fine
 * for a page nobody is editing and wrong for one an editor has just
 * corrected: a correction should be in front of readers on the next request,
 * not up to an hour later.
 */
export function revalidateStory(categorySlug: string | null | undefined, slug: string | null | undefined) {
  const paths: string[] = [];
  if (categorySlug && slug) paths.push(`/${categorySlug}/${slug}`);
  if (categorySlug) paths.push(`/${categorySlug}`);
  paths.push("/");
  for (const path of paths) revalidatePath(path);
  // The edge's copies go too. Not awaited: the caller is usually a form
  // action answering an editor, and the purge logs its own failure.
  void purgeEdge(paths);
}

/** The category slug from a Supabase row's embedded `categories ( slug )`. */
export function categorySlugOf(row: { categories?: unknown } | null | undefined): string | null {
  const categories = row?.categories as { slug?: string } | { slug?: string }[] | null | undefined;
  if (Array.isArray(categories)) return categories[0]?.slug ?? null;
  return categories?.slug ?? null;
}
