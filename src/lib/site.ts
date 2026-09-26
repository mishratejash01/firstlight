/**
 * Masthead identity.
 *
 * The paper's name is the one piece of brand copy that appears in the flag, the
 * footer, every page title, the Google News sitemap and the publisher block of
 * the article schema. Defined once here so a rename is one edit rather than
 * twenty, and so the name in a search result can never drift from the name at
 * the top of the page.
 */
export const SITE_NAME = "The India Decade";

/**
 * What the paper covers, in one line.
 *
 * Sits under the nameplate in the footer and closes the home page title. Here
 * rather than written out at each of those, for the same reason the name is: a
 * paper whose description in a search result disagrees with the one under its
 * own nameplate looks like two different papers.
 */
export const SITE_TAGLINE =
  "reporting on politics, business, science and culture";

/**
 * Where the paper's social accounts live.
 *
 * Fill in a URL and that icon appears in the masthead; leave it empty and the
 * icon is not rendered at all. That is deliberate — a social icon linking
 * nowhere is worse than no icon, and a newsroom that has not opened an account
 * yet should not ship a dead link to one.
 *
 * Not database-driven like the section navigation is: these are brand
 * identifiers set once at launch, not editorial decisions made daily.
 */
export const SOCIAL_LINKS: { name: string; href: string }[] = [
  { name: "X", href: "" },
  { name: "Facebook", href: "" },
  { name: "Instagram", href: "" },
];
