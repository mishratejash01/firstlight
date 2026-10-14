import type { EditionArticle } from "@/lib/queries/epaper";

/**
 * Lays a day's stories out as the pages of a newspaper.
 *
 * Page 1 is the front: the day's most important stories from across the
 * paper, at most two from any one section, so the front is a front and not
 * the politics page. Then the sections, in the paper's own running order (the
 * order editors set in the database, the same one the header uses). A section
 * with a lot of news gets as many pages as it needs; small sections share a
 * page rather than each filling one with two stories. Case studies, which are
 * not news, get a page of their own after the news; then the puzzles, when
 * the edition has them (lib/epaper/puzzles). The index comes last.
 *
 * Every page has the same shape: one lead, run in full; up to two second
 * stories, run as their opening paragraphs; and briefs. Pure function, no
 * database: the route fetches and this only arranges.
 */

/** Stories on one inside page: a lead, two seconds and five briefs. */
const PAGE_CAPACITY = 8;
/** A section this small shares a page with its neighbours. */
const SMALL_SECTION = 3;
/** How many small sections one shared page will carry. */
const SECTIONS_PER_SHARED_PAGE = 3;
/** The front: a lead, two seconds, four briefs. */
const FRONT_STORIES = 7;
const FRONT_PER_SECTION = 2;
const SECONDS = 2;

export type EpaperPage = {
  number: number;
  kind: "front" | "section" | "cases" | "puzzles" | "index";
  /** "Politics", "Science · Health · Environment". A section over several pages carries its name on each. */
  title: string;
  lead: EditionArticle | null;
  seconds: EditionArticle[];
  briefs: EditionArticle[];
};

/**
 * Most worth leading on, first. A breaking story outranks everything; then the
 * stories readers actually read; then the section's place in the running
 * order; then a story with a picture over one without, since a page leads
 * with a picture; then the newer.
 */
function compareByWeight(order: Map<string, number>) {
  const place = (article: EditionArticle) => order.get(article.categories.slug) ?? order.size;
  return (a: EditionArticle, b: EditionArticle) =>
    Number(b.is_breaking) - Number(a.is_breaking) ||
    (b.read_count ?? 0) - (a.read_count ?? 0) ||
    place(a) - place(b) ||
    Number(Boolean(b.hero_image_url)) - Number(Boolean(a.hero_image_url)) ||
    Date.parse(b.published_at ?? "") - Date.parse(a.published_at ?? "");
}

/** The lead is the strongest story with a body to run, preferring one with a picture. */
function arrange(
  stories: EditionArticle[],
): Pick<EpaperPage, "lead" | "seconds" | "briefs"> {
  if (!stories.length) return { lead: null, seconds: [], briefs: [] };
  const top = stories.slice(0, 3);
  const lead =
    top.find((story) => story.body && story.hero_image_url) ??
    top.find((story) => story.body) ??
    stories[0];
  const rest = stories.filter((story) => story !== lead);
  return { lead, seconds: rest.slice(0, SECONDS), briefs: rest.slice(SECONDS) };
}

/** Split a big section into pages of near-equal size, never leaving one story alone. */
function chunk<T>(items: T[]): T[][] {
  const pages = Math.ceil(items.length / PAGE_CAPACITY);
  const size = Math.ceil(items.length / pages);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function composeEdition(
  articles: EditionArticle[],
  sectionOrder: Map<string, number>,
  options: { puzzles?: boolean } = {},
): EpaperPage[] {
  const byWeight = compareByWeight(sectionOrder);
  const news = articles.filter((story) => story.format !== "case_study").sort(byWeight);
  const cases = articles.filter((story) => story.format === "case_study").sort(byWeight);

  // The front: the strongest stories, no section taking more than two places.
  const front: EditionArticle[] = [];
  const perSection = new Map<string, number>();
  for (const story of news) {
    if (front.length === FRONT_STORIES) break;
    const taken = perSection.get(story.categories.slug) ?? 0;
    if (taken >= FRONT_PER_SECTION) continue;
    front.push(story);
    perSection.set(story.categories.slug, taken + 1);
  }
  const onFront = new Set(front.map((story) => story.id));

  // Inside: what the front did not carry, section by section in running order.
  const groups = new Map<string, { name: string; stories: EditionArticle[] }>();
  for (const story of news) {
    if (onFront.has(story.id)) continue;
    const group = groups.get(story.categories.slug) ?? { name: story.categories.name, stories: [] };
    group.stories.push(story);
    groups.set(story.categories.slug, group);
  }
  const sections = [...groups.entries()].sort(
    ([a, ga], [b, gb]) =>
      (sectionOrder.get(a) ?? sectionOrder.size) - (sectionOrder.get(b) ?? sectionOrder.size) ||
      ga.name.localeCompare(gb.name),
  );

  type Draft = { names: string[]; stories: EditionArticle[] };
  const drafts: Draft[] = [];
  let shared: Draft | null = null;
  const flush = () => {
    if (shared) drafts.push(shared);
    shared = null;
  };

  for (const [, group] of sections) {
    if (group.stories.length > SMALL_SECTION) {
      flush();
      chunk(group.stories).forEach((stories) =>
        drafts.push({ names: [group.name], stories }),
      );
      continue;
    }
    const current = shared as Draft | null;
    if (
      current &&
      current.stories.length + group.stories.length <= PAGE_CAPACITY &&
      current.names.length < SECTIONS_PER_SHARED_PAGE
    ) {
      current.names.push(group.name);
      current.stories.push(...group.stories);
    } else {
      flush();
      shared = { names: [group.name], stories: [...group.stories] };
    }
  }
  flush();

  const pages: EpaperPage[] = [];
  if (front.length) {
    pages.push({ number: 1, kind: "front", title: "Front page", ...arrange(front) });
  }
  for (const draft of drafts) {
    pages.push({
      number: pages.length + 1,
      kind: "section",
      title: draft.names.join(" · "),
      ...arrange([...draft.stories].sort(byWeight)),
    });
  }
  for (const stories of cases.length ? chunk(cases) : []) {
    pages.push({ number: pages.length + 1, kind: "cases", title: "Case studies", ...arrange(stories) });
  }
  if (pages.length && options.puzzles) {
    pages.push({ number: pages.length + 1, kind: "puzzles", title: "Puzzles", lead: null, seconds: [], briefs: [] });
  }
  if (pages.length) {
    pages.push({ number: pages.length + 1, kind: "index", title: "Index", lead: null, seconds: [], briefs: [] });
  }
  return pages;
}
