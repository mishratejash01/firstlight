/**
 * Story text set for print.
 *
 * The e-paper is read like a newspaper, not clicked through like the site, so
 * what it prints carries no links and nothing that only works on a screen:
 * links become their words, and the story's own pictures, videos and bare
 * addresses are left out (each story still runs with its main photograph).
 */

/** A block that is a picture, or nothing but an address (a video, a link). */
const SCREEN_ONLY = /^(!\[[^\]]*\]\([^)]*\)|<?https?:\/\/\S+>?)$/;

/** Headings, quotes, lists and tables: the story's furniture, not its opening lines. */
const NOT_PROSE = /^(#|\||>|[-*] |\d+\. )/;

/** [words](address) to words, everywhere in a block. */
function unlink(markdown: string): string {
  return markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

function blocks(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  return markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block && !SCREEN_ONLY.test(block))
    .map(unlink)
    .filter(Boolean);
}

/** The whole story, as Markdown for renderMarkdown, with nothing to click. */
export function forPrint(markdown: string | null | undefined): string {
  return blocks(markdown).join("\n\n");
}

/** The first `count` prose paragraphs, unlinked, for a second story. */
export function openingParagraphs(markdown: string | null | undefined, count: number): string {
  return blocks(markdown)
    .filter((block) => !NOT_PROSE.test(block))
    .slice(0, count)
    .join("\n\n");
}

/**
 * What a brief prints under its headline: the standfirst, which is written to
 * stand alone, or failing that the story's first paragraph in full. Never a
 * sentence cut short, since there is no link to the rest.
 */
export function briefText(
  body: string | null | undefined,
  standfirst: string | null | undefined,
): string {
  if (standfirst?.trim()) return standfirst.trim();
  const first = blocks(body).find((block) => !NOT_PROSE.test(block)) ?? "";
  return first.replace(/[*_`]+/g, "").replace(/\s+/g, " ").trim();
}
