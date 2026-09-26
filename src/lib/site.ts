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
 * Sits under the nameplate in the footer and on the default share image. Here
 * rather than written out at each of those, for the same reason the name is: a
 * paper that describes itself differently in two places looks like two
 * different papers.
 */
export const SITE_TAGLINE =
  "reporting on politics, business, science and culture";

/**
 * The description search engines and link previews show for the paper as a
 * whole: the front page, and any page that does not describe itself. Written
 * in the words people search for news with, as a sentence rather than a list.
 */
export const SITE_DESCRIPTION =
  "Latest news today from India and the world: breaking news and top headlines on politics, business, technology, sports, entertainment, health and science.";

/**
 * The one address the paper is published at, with no trailing slash.
 *
 * Every canonical link, sitemap entry, feed item and structured-data URL is
 * built from this, so the site can be reached at other hostnames (the hosting
 * provider's own) without any of them competing with it in search.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

/** The canonical hostname, for comparing against the host a request arrived on. */
export const SITE_HOST = new URL(SITE_URL).host;

/**
 * How the newsroom's own fetchers (wire, feeds, source articles, picture
 * libraries) identify themselves to the sites they read: a product token a
 * site owner can match in robots.txt, and the address the paper is found at.
 * Built from the name and the address, so a rename or a move reaches every
 * fetcher at once instead of leaving one announcing an old name.
 */
export const CRAWLER_TOKEN = `${SITE_NAME.replace(/[^A-Za-z0-9]/g, "")}Bot`;
export const CRAWLER_USER_AGENT = `${CRAWLER_TOKEN}/1.0 (+${SITE_URL})`;

/**
 * English, written for readers in India. BCP 47 for the page's lang attribute
 * and inLanguage in structured data; the underscore form is Open Graph's.
 */
export const SITE_LANGUAGE = "en-IN";
export const SITE_LOCALE = "en_IN";

/** An absolute URL on the canonical host for a site path such as "/politics". */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized === "/" ? SITE_URL : `${SITE_URL}${normalized}`;
}

/**
 * Who publishes the paper, and how to reach them. Supplied by the owner.
 *
 * Every empty value is simply left off the site: the About, Masthead, Contact
 * and Privacy pages and the publisher's structured data show only the facts
 * filled in here, so no page ever publishes a placeholder. The grievance
 * officer is what rule 11 of India's IT (Intermediary Guidelines and Digital
 * Media Ethics Code) Rules, 2021 asks every digital news publisher to name on
 * its site; the Contact page appears once one is set.
 */
export const PUBLISHER: {
  /** The registered legal name of the company or person that owns the paper. */
  legalName: string;
  /** Registered office address in India, on one line. */
  address: string;
  /** Newsroom email for tips, corrections and general contact. */
  email: string;
  /** Newsroom telephone, in international format. */
  phone: string;
  /** Year the paper was founded, e.g. "2026". */
  foundingYear: string;
  /** The person with editorial responsibility for what the paper publishes. */
  editor: { name: string; title: string };
  /** The grievance officer required by the IT Rules, 2021. Based in India. */
  grievanceOfficer: { name: string; email: string; phone: string };
} = {
  legalName: "",
  address: "",
  email: "",
  phone: "",
  foundingYear: "",
  editor: { name: "", title: "" },
  grievanceOfficer: { name: "", email: "", phone: "" },
};

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
  { name: "X", href: "https://x.com/theindiadecade" },
  { name: "Facebook", href: "" },
  { name: "Instagram", href: "https://www.instagram.com/theindiadecade/" },
];
