import Image from "next/image";
import { Fragment, type ReactNode } from "react";

import { YouTubeEmbed } from "@/components/article/youtube-embed";
import { cloudinaryImage, cloudinaryVideoPoster } from "@/lib/media/transform";

/**
 * A deliberately small Markdown subset, rendered straight to React elements.
 *
 * There is no dangerouslySetInnerHTML anywhere in this file, and that is the
 * point. Article bodies are written by contributors and wire ingestion, so they
 * are untrusted input; rendering them as HTML would make a stored XSS the
 * default failure mode, and sanitising after the fact is a game you have to win
 * every time. Producing React elements means markup in the source is text, not
 * markup, no matter what anyone writes.
 *
 * Body copy is set in the serif at 18px. A news page is read, not scanned,
 * and the serif is what tells a reader before they read a word that this is
 * reporting rather than interface. The sans is left to furniture: bylines,
 * captions, timestamps and navigation.
 *
 * Supported: '## '/'### ' headings, paragraphs, '- ' lists, '> ' quotes,
 * **bold**, *italic*, [text](url), ![alt](url"optional caption") for
 * images, video files and YouTube videos, and pipe tables (a header row, a
 * '---' separator row, then one row per item). Anything else renders as
 * literal text.
 */

type Block =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "media"; alt: string; url: string; caption: string | null }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "table"; header: string[]; aligns: Align[]; rows: string[][] };

type Align = "left" | "center" | "right" | null;

/** A line that could be a table row: it opens or closes on a pipe. */
function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.includes("|") && (t.startsWith("|") || t.endsWith("|"));
}

/** The '---' row under a table's header, with optional ':' for alignment. */
function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line.trim());
}

/**
 * A row's cells. A pipe with a backslash before it belongs to the cell's text
 * rather than starting a new column. The row is walked character by character
 * instead of split on a pattern, so recognising that escape needs no regular
 * expression and no escape sequence in this source.
 */
function tableCells(line: string): string[] {
  const BACKSLASH = String.fromCharCode(92);
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith(BACKSLASH + "|")) t = t.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < t.length; i += 1) {
    if (t[i] === BACKSLASH && t[i + 1] === "|") {
      cell += "|";
      i += 1;
    } else if (t[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += t[i];
    }
  }
  cells.push(cell.trim());
  return cells;
}

function tableAligns(separator: string): Align[] {
  return tableCells(separator).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", text: paragraph.join("").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length) {
      blocks.push({ kind: "list", items: listItems });
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trimEnd();

    // A table is a header row followed directly by its '---' separator. A
    // stray pipe in an ordinary sentence has no separator under it, so it
    // stays a sentence.
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushParagraph();
      flushList();
      const header = tableCells(line);
      const aligns = tableAligns(lines[i + 1]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i]) && lines[i].trim()) {
        const cells = tableCells(lines[i]);
        // Every row gets exactly the header's number of cells, so a row a
        // writer left short does not shift its neighbours out of their columns.
        rows.push(header.map((_, c) => cells[c] ?? ""));
        i += 1;
      }
      i -= 1;
      if (rows.length) {
        blocks.push({ kind: "table", header, aligns, rows });
      } else {
        paragraph.push(line.trim());
      }
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    // A line that is nothing but an image is a figure, not a paragraph
    // containing an image — that distinction is what lets it break out of the
    // text measure and carry a caption.
    const media = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/.exec(
      line.trim(),
    );
    if (media) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: "media",
        alt: media[1],
        url: media[2],
        caption: media[3] ?? null,
      });
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: "heading",
        level: heading[1].length === 2 ? 2 : 3,
        text: heading[2].trim(),
      });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      listItems.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "quote", text: line.replace(/^>\s?/, "") });
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}

/**
 * Only http, https and site-relative links are emitted. Without this check a
 * `[click](javascript:...)` in an article body becomes a working script URL.
 */
function isSafeHref(href: string): boolean {
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try {
    const { protocol } = new URL(href);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The video id from a YouTube watch, share or embed link, or null. Only
 * YouTube's own hosts count, so a link elsewhere that happens to carry a "v"
 * parameter is never turned into a player.
 */
function youtubeIdOf(href: string): string | null {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = url.searchParams.get("v") ?? /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null;
    } else if (host === "youtu.be") {
      id = url.pathname.slice(1).split("/")[0] || null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Where a YouTube link asks the video to start, in whole seconds: the "t" or
 * "start" parameter, as "754", "754s" or "12m34s". Undefined when there is
 * none or it cannot be read, and the video starts at the beginning.
 */
function youtubeStartOf(href: string): number | undefined {
  try {
    const url = new URL(href);
    const raw = url.searchParams.get("t") ?? url.searchParams.get("start");
    if (!raw) return undefined;
    if (/^\d+s?$/.test(raw)) return Number.parseInt(raw, 10) || undefined;
    const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
    if (!parts || !parts[0]) return undefined;
    const seconds = Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0);
    return seconds || undefined;
  } catch {
    return undefined;
  }
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|!?\[[^\]]*\]\([^)\s]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode {
  const parts = text.split(INLINE).filter((part) => part !== "");

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    // An image written mid-paragraph renders as its alt text rather than
    // breaking the flow of a sentence; a figure has to be on its own line.
    const inlineImage = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(part);
    if (inlineImage) return <Fragment key={key}>{inlineImage[1]}</Fragment>;

    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      if (!isSafeHref(href)) return <Fragment key={key}>{label}</Fragment>;
      const external = /^https?:\/\//.test(href);
      return (
        <a
          key={key}
          href={href}
          className="text-accent underline underline-offset-[3px] decoration-hairline hover:decoration-accent"
          {...(external
            ? { rel: "noopener noreferrer", target: "_blank" }
            : {})}
        >
          {label}
        </a>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    return <Fragment key={key}>{part}</Fragment>;
  });
}

/**
 * Something to place between the paragraphs of a story — the "Latest" block,
 * for one. It goes in after the given paragraph, counting paragraphs only, and
 * never as the very last thing in the body. An insert the story is too short
 * to reach goes at the end instead, so a short story still carries it.
 */
export type BodyInsert = { afterParagraph: number; node: ReactNode };

export function renderMarkdown(
  markdown: string | null | undefined,
  options: { inserts?: BodyInsert[] } = {},
): ReactNode {
  if (!markdown) return null;

  const blocks = parseBlocks(markdown);
  const pending = [...(options.inserts ?? [])].sort(
    (a, b) => a.afterParagraph - b.afterParagraph,
  );
  const out: ReactNode[] = [];
  let paragraphs = 0;

  blocks.forEach((block, index) => {
    out.push(renderBlock(block, index));
    if (block.kind !== "paragraph") return;
    paragraphs += 1;
    const isLast = index === blocks.length - 1;
    while (pending.length && pending[0].afterParagraph === paragraphs && !isLast) {
      const insert = pending.shift()!;
      out.push(<Fragment key={`insert-${index}`}>{insert.node}</Fragment>);
    }
  });

  pending.forEach((insert, i) => {
    out.push(<Fragment key={`insert-end-${i}`}>{insert.node}</Fragment>);
  });

  return out;
}

function renderBlock(block: Block, index: number): ReactNode {
    const key = `b${index}`;

    switch (block.kind) {
      case "heading":
        // Subheadings mirror the sub-questions readers actually search, which
        // is what lets a search engine lift one section as a snippet. h2 is
        // correct here: the article headline already owns the page's h1.
        return block.level === 2 ? (
          <h2
            key={key}
            className="mt-9 mb-3 text-[1.5rem] leading-snug text-ink"
          >
            {renderInline(block.text, key)}
          </h2>
        ) : (
          <h3
            key={key}
            className="mt-7 mb-2 text-[1.2rem] leading-snug text-ink"
          >
            {renderInline(block.text, key)}
          </h3>
        );

      case "media": {
        if (!isSafeHref(block.url)) return null;
        const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(block.url);
        const youtubeId = youtubeIdOf(block.url);

        if (youtubeId) {
          return (
            <figure key={key} className="media-wide">
              <YouTubeEmbed id={youtubeId} title={block.alt || "Video"} start={youtubeStartOf(block.url)} />
              {block.caption ? (
                <figcaption className="mt-2 text-meta leading-relaxed text-muted">
                  {block.caption}
                </figcaption>
              ) : null}
            </figure>
          );
        }

        return (
          <figure key={key} className="media-wide">
            {/* Shrink-wraps the media so a caption sits under the picture's own
 left edge. Without it, a portrait frame that has scaled down to
 sit inside the height cap keeps a caption ranged to the full
 breakout width, floating well clear of the image above it. */}
            <div className="mx-auto w-fit max-w-full">
              {isVideo ? (
                // The 16:9 box is reserved before the file is touched, so the copy
                // below does not jump once metadata loads. Anything that is not
                // 16:9 letterboxes against the ink rather than being cropped —
                // a player letterboxes, it does not recompose the shot.
                <video
                  controls
                  playsInline
                  preload="metadata"
                  poster={cloudinaryVideoPoster(block.url) ?? undefined}
                  className="aspect-video w-full rounded-media bg-ink object-contain"
                >
                  <source src={block.url} />
                  Your browser cannot play this video.
                </video>
              ) : (
                // No object-cover here on purpose. A card in a grid has to crop
                // to keep the row even; a photograph inside a story does not, and
                // cropping every one to 16:9 would quietly ruin every portrait
                // frame a picture desk files.
                //
                // The height cap is what makes that safe. Left alone, a portrait
                // frame at the full breakout width runs about 1,250px tall and
                // swallows the screen, so tall images scale down to the cap and
                // centre instead. A landscape frame is nowhere near it and fills
                // the breakout as intended.
                <Image
                  src={cloudinaryImage(block.url, "hero") ?? block.url}
                  alt={block.alt}
                  width={1600}
                  height={900}
                  sizes="(max-width: 1024px) 100vw, 672px"
                  className="mx-auto block h-auto max-h-[40rem] w-auto max-w-full rounded-media bg-hairline"
                />
              )}
              {block.caption ? (
                <figcaption className="mt-2 text-meta leading-relaxed text-muted">
                  {block.caption}
                </figcaption>
              ) : null}
            </div>
          </figure>
        );
      }

      case "list":
        return (
          <ul
            key={key}
            className="my-5 list-disc space-y-2 pl-5 text-prose text-ink"
          >
            {block.items.map((item, i) => (
              <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
            ))}
          </ul>
        );

      case "quote":
        return (
          <blockquote
            key={key}
            className="my-7 border-l-2 border-ink pl-5 text-[1.25rem] leading-[1.45] text-ink"
          >
            {renderInline(block.text, key)}
          </blockquote>
        );

      case "table":
        // Comparisons set as a real table. It scrolls sideways inside its own
        // box on a phone rather than widening the page, and the first cell of
        // each row is that row's header, so a screen reader announces each
        // figure with the thing it belongs to.
        return (
          <div
            key={key}
            className="table-wrap my-7"
            role="region"
            aria-label="Table"
            tabIndex={0}
          >
            <table className="data-table">
              <thead>
                <tr>
                  {block.header.map((cell, c) => (
                    <th
                      key={`${key}-h${c}`}
                      scope="col"
                      style={block.aligns[c] ? { textAlign: block.aligns[c]! } : undefined}
                    >
                      {renderInline(cell, `${key}-h${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={`${key}-r${r}`}>
                    {row.map((cell, c) => {
                      const style = block.aligns[c] ? { textAlign: block.aligns[c]! } : undefined;
                      return c === 0 ? (
                        <th key={`${key}-${r}-${c}`} scope="row" style={style}>
                          {renderInline(cell, `${key}-${r}-${c}`)}
                        </th>
                      ) : (
                        <td key={`${key}-${r}-${c}`} style={style}>
                          {renderInline(cell, `${key}-${r}-${c}`)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      default:
        return (
          <p key={key} className="my-5 text-prose text-ink">
            {renderInline(block.text, key)}
          </p>
        );
    }
}
