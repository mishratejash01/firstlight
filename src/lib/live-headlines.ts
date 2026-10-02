/**
 * The live part of every page, served once for the whole site.
 *
 * Every page carries the same few things that change whenever anything is
 * published: the breaking banner, the three latest stories under each section
 * in the header, and the "Latest" column beside a story. Built into each page,
 * they made every one of five hundred cached pages change with each new story,
 * and the hosting plan pays for every changed page it stores again. Served
 * from one small file instead (/api/headlines), they change once per story for
 * the whole site, and a page stays as it was cached until the story on it
 * changes.
 *
 * Shared by the route that builds the file and the browser code that reads it.
 */

export const LIVE_HEADLINES_PATH = "/api/headlines";

export type LiveHeadline = {
  id: string;
  slug: string;
  headline: string;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  categories: { slug: string; name: string };
};

export type LiveHeadlines = {
  /** Breaking stories still inside the banner's window, the most consequential first. */
  breaking: LiveHeadline[];
  /** The newest stories across the paper. */
  latest: LiveHeadline[];
  /** Each section's newest stories, for the panels under the section strip. */
  bySection: Record<string, LiveHeadline[]>;
};
