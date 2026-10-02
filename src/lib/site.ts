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

/**
 * An absolute URL on the canonical host for a site path such as "/politics".
 * The front page keeps its slash ("https://www.theindiadecade.com/"), the
 * address a browser and a crawler actually request: written without it, the
 * home page's canonical named a URL that differed from the page's own by one
 * character, which some search tools report as a different, redirected page.
 */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}

/**
 * The domain the paper's email addresses are at: the bare domain, not the www
 * host the site is served from. One constant, so that a move to a new domain
 * is one edit rather than five.
 */
const MAIL_DOMAIN = "theindiadecade.com";

/**
 * Who publishes the paper, and how to reach them. Supplied by the owner.
 *
 * Every empty value is simply left off the site: the About, Masthead, Contact
 * and Privacy pages and the publisher's structured data show only the facts
 * filled in here, so no page ever publishes a placeholder. The grievance
 * officer is what rule 11 of India's IT (Intermediary Guidelines and Digital
 * Media Ethics Code) Rules, 2021 asks every digital news publisher to name on
 * its site.
 *
 * Each address is a mailbox with one job, so that a reader reporting an error
 * reaches the editor rather than the advertising desk, and each inbox can be
 * handed to whoever does that job. Only these mailboxes are published, never
 * aliases of them, so nothing on the site can bounce while they exist.
 */
export const PUBLISHER: {
  /** The registered legal name of the company or person that owns the paper. */
  legalName: string;
  /** Registered office address in India, on one line. */
  address: string;
  /** General enquiries: questions about the site or an account, jobs, and anything the other addresses do not cover. */
  email: string;
  /** The news desk: tips, press releases and invitations. */
  newsroomEmail: string;
  /** Advertising, sponsorship, syndication and other partnerships. */
  partnershipsEmail: string;
  /** Newsroom telephone, in international format. */
  phone: string;
  /** Year the paper was founded, e.g. "2026". */
  foundingYear: string;
  /** The person with editorial responsibility for what the paper publishes; their address takes corrections and letters. */
  editor: { name: string; title: string; email: string };
  /** The grievance officer required by the IT Rules, 2021. Based in India. Also answers requests about readers' personal data. */
  grievanceOfficer: { name: string; email: string; phone: string };
} = {
  legalName: "",
  address: "",
  email: `contact@${MAIL_DOMAIN}`,
  newsroomEmail: `newsroom@${MAIL_DOMAIN}`,
  partnershipsEmail: `partnerships@${MAIL_DOMAIN}`,
  phone: "",
  foundingYear: "",
  editor: { name: "", title: "", email: `editor@${MAIL_DOMAIN}` },
  grievanceOfficer: { name: "", email: `grievance@${MAIL_DOMAIN}`, phone: "" },
};

/**
 * Whether the contact page has anything on it. It exists only once there is
 * some way to reach the paper, and every link to it checks this first, so no
 * page ever links to one that is not there.
 */
export const HAS_CONTACT_PAGE = Boolean(
  PUBLISHER.email ||
    PUBLISHER.newsroomEmail ||
    PUBLISHER.partnershipsEmail ||
    PUBLISHER.phone ||
    PUBLISHER.editor.email ||
    PUBLISHER.grievanceOfficer.name ||
    PUBLISHER.grievanceOfficer.email,
);

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

/**
 * The paper's X handle, read from its X link ("@theindiadecade"). Link cards
 * shared on X name it as the site, so a story shared by anyone is credited to
 * the paper's account. Undefined until the X link is set.
 */
export const X_HANDLE: string | undefined = (() => {
  const href = SOCIAL_LINKS.find((link) => link.name === "X")?.href;
  const handle = href?.match(/^https:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];
  return handle ? `@${handle}` : undefined;
})();
