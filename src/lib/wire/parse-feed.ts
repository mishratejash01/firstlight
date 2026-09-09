import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";

/**
 * RSS and Atom parsing.
 *
 * One parser for both, because the difference is field names rather than
 * structure, and a feed's format is not something an editor should have to know
 * when adding a source.
 *
 * Nothing here trusts the feed. Titles and bodies are arbitrary text from a
 * third party, so they are carried through as data and only ever rendered by
 * the Markdown renderer, which cannot emit markup. HTML in a feed body is
 * stripped to text rather than becoming part of our page.
 */

export type ParsedFeedItem = {
  externalId: string;
  contentHash: string;
  title: string;
  summary: string | null;
  body: string | null;
  link: string | null;
  authorName: string | null;
  publishedAt: string | null;
  categories: string[];
  raw: Record<string, unknown>;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Feeds are wildly inconsistent about whether a single entry is an array.
  // Forcing these removes a whole class of "works until it doesn't" bug.
  isArray: (name) => ["item", "entry", "category"].includes(name),
  trimValues: true,
});

function text(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // Atom content and CDATA sections both land under #text.
    const inner = record["#text"];
    if (typeof inner === "string") return inner.trim() || null;
  }
  return null;
}

/** Feed bodies routinely carry HTML. We keep plain text; editors write the copy. */
function stripHtml(value: string | null): string | null {
  if (!value) return null;
  const stripped = value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || null;
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function linkFrom(entry: Record<string, unknown>): string | null {
  const direct = text(entry.link);
  if (direct) return direct;

  // Atom expresses links as one or more <link href rel>. The alternate is the
  // human-readable page, which is the one worth keeping.
  const links = entry.link;
  const candidates = Array.isArray(links) ? links : links ? [links] : [];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      const record = candidate as Record<string, unknown>;
      const rel = record["@_rel"];
      if (!rel || rel === "alternate") {
        const href = record["@_href"];
        if (typeof href === "string") return href;
      }
    }
  }
  return null;
}

export function parseFeed(xml: string): ParsedFeedItem[] {
  const parsed = parser.parse(xml) as Record<string, unknown>;

  const rss = parsed.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const atom = parsed.feed as Record<string, unknown> | undefined;

  const entries = (channel?.item ?? atom?.entry ?? []) as Record<string, unknown>[];

  const items: ParsedFeedItem[] = [];

  for (const entry of entries) {
    const title = text(entry.title);
    if (!title) continue;

    const link = linkFrom(entry);
    const summary = stripHtml(text(entry.description) ?? text(entry.summary));
    const body = stripHtml(text(entry["content:encoded"]) ?? text(entry.content));

    const publishedAt = toIso(
      text(entry.pubDate) ?? text(entry.published) ?? text(entry.updated),
    );

    const authorObject = entry.author as Record<string, unknown> | undefined;
    const authorName =
      text(entry["dc:creator"]) ??
      text(entry.author) ??
      text(authorObject?.name) ??
      null;

    const rawCategories = (entry.category ?? []) as unknown[];
    const categories: string[] = [];
    for (const category of rawCategories) {
      const asRecord = category as Record<string, unknown> | undefined;
      const value = text(category) ?? text(asRecord?.["@_term"]);
      if (value) categories.push(value);
    }

    // Prefer the feed's own identifier, then the link, then the title. A feed
    // offering none of the three is not worth a partial import.
    const externalId = text(entry.guid) ?? text(entry.id) ?? link ?? title;

    // Hashing the content rather than the id is what tells a genuine upstream
    // correction apart from the same item arriving on the next poll.
    const contentHash = createHash("sha256")
      .update([title, summary ?? "", body ?? "", link ?? ""].join(" "))
      .digest("hex");

    items.push({
      externalId,
      contentHash,
      title,
      summary,
      body,
      link,
      authorName,
      publishedAt,
      categories,
      raw: entry,
    });
  }

  return items;
}
