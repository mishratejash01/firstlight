import { Fragment, type ReactNode } from "react";

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
 * Supported: '## '/'### ' headings, paragraphs, '- ' lists, '> ' quotes,
 * **bold**, *italic*, [text](url). Anything else renders as literal text.
 */

type Block =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "quote"; text: string };

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length) {
      blocks.push({ kind: "list", items: listItems });
      listItems = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushParagraph();
      flushList();
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

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode {
  const parts = text.split(INLINE).filter((part) => part !== "");

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

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
          {...(external ? { rel: "noopener noreferrer", target: "_blank" } : {})}
        >
          {label}
        </a>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function renderMarkdown(markdown: string | null | undefined): ReactNode {
  if (!markdown) return null;

  return parseBlocks(markdown).map((block, index) => {
    const key = `b${index}`;

    switch (block.kind) {
      case "heading":
        // Subheadings mirror the sub-questions readers actually search, which
        // is what lets a search engine lift one section as a snippet. h2 is
        // correct here: the article headline already owns the page's h1.
        return block.level === 2 ? (
          <h2 key={key} className="mt-9 mb-3 font-serif text-[1.3rem] leading-snug text-ink">
            {renderInline(block.text, key)}
          </h2>
        ) : (
          <h3 key={key} className="mt-7 mb-2 font-serif text-[1.1rem] leading-snug text-ink">
            {renderInline(block.text, key)}
          </h3>
        );

      case "list":
        return (
          <ul key={key} className="my-4 list-disc space-y-2 pl-5 text-body text-ink">
            {block.items.map((item, i) => (
              <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
            ))}
          </ul>
        );

      case "quote":
        return (
          <blockquote
            key={key}
            className="my-6 border-l-2 border-hairline pl-4 font-serif text-lead text-ink"
          >
            {renderInline(block.text, key)}
          </blockquote>
        );

      default:
        return (
          <p key={key} className="my-4 text-body leading-relaxed text-ink">
            {renderInline(block.text, key)}
          </p>
        );
    }
  });
}
