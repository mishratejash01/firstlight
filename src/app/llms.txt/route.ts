import { getLatestArticles, getSections, articlePath } from "@/lib/queries/syndication";
import {
  HAS_CONTACT_PAGE,
  PUBLISHER,
  SITE_DESCRIPTION,
  SITE_NAME,
  absoluteUrl,
} from "@/lib/site";

/**
 * /llms.txt, in the format proposed at llmstxt.org: a plain Markdown map of the
 * site for language models and the tools built on them.
 *
 * No AI company has said its crawler reads this file, so it is not relied on
 * for anything. It costs one cached route, and when a model is pointed at the
 * site it hands over what matters in one read: what the paper is, where its
 * standards and corrections live, its sections, and the latest stories with a
 * one-line summary each.
 */
export const revalidate = 600;

function line(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Who to write to about what, with the addresses written out, so that a model
 * asked how to reach the paper about something answers with the right inbox
 * rather than a guess at one.
 */
function contactLines(): string[] {
  if (!HAS_CONTACT_PAGE) return [];

  const officer = PUBLISHER.grievanceOfficer;
  const rows = [
    PUBLISHER.newsroomEmail ? `- News tips and press releases: ${PUBLISHER.newsroomEmail}` : "",
    PUBLISHER.editor.email ? `- Corrections, letters and the editor: ${PUBLISHER.editor.email}` : "",
    PUBLISHER.partnershipsEmail
      ? `- Advertising, sponsorship and syndication: ${PUBLISHER.partnershipsEmail}`
      : "",
    PUBLISHER.email ? `- General enquiries: ${PUBLISHER.email}` : "",
    officer.email
      ? `- Grievance officer${officer.name ? ` (${officer.name})` : ""}, for complaints about content under India's IT Rules, 2021, and requests about personal data: ${officer.email}`
      : "",
  ].filter(Boolean);

  return [
    "## Contact",
    "",
    `- [Contact page](${absoluteUrl("/contact")}): every way to reach ${SITE_NAME}`,
    ...rows,
    "",
  ];
}

export async function GET() {
  const [sections, latest] = await Promise.all([
    getSections(),
    getLatestArticles({ limit: 100 }),
  ]);

  const out: string[] = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `${SITE_NAME} is an English-language news publication covering India and the world, organised into the sections below. Every story carries its publication date and its section.`,
    "",
    "## About the paper",
    "",
    `- [About](${absoluteUrl("/about")}): who publishes ${SITE_NAME} and why`,
    `- [Editorial standards](${absoluteUrl("/editorial-standards")}): how stories are sourced, verified and written`,
    `- [Corrections](${absoluteUrl("/corrections")}): how errors are corrected and where corrections appear`,
    `- [Masthead](${absoluteUrl("/masthead")}): the people responsible for the paper`,
    "",
    ...contactLines(),
    "## Sections",
    "",
    ...sections.map(
      (section) =>
        `- [${section.name}](${absoluteUrl(`/${section.slug}`)})${section.description ? `: ${line(section.description)}` : ""}`,
    ),
    "",
    "## Latest stories",
    "",
    ...latest.map((article) => {
      const date = article.published_at.slice(0, 10);
      const summary = line(article.standfirst ?? article.summary);
      return `- [${line(article.headline)}](${absoluteUrl(articlePath(article))}): ${date}, ${article.categories.name}${summary ? `. ${summary}` : ""}`;
    }),
    "",
    "## Feeds and sitemaps",
    "",
    `- [RSS feed](${absoluteUrl("/feed.xml")}): the fifty newest stories; each section has its own at /<section>/feed.xml`,
    `- [News sitemap](${absoluteUrl("/news-sitemap.xml")}): stories from the last 48 hours`,
    `- [Sitemap](${absoluteUrl("/sitemap.xml")}): every public page`,
    "",
  ];

  return new Response(out.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=1200",
    },
  });
}
