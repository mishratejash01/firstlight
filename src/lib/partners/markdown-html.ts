/**
 * The drafter's Markdown as HTML for karostartup.com, whose article body is
 * stored and rendered as HTML (their editor is a rich-text box). Their page
 * shows a pipe table as a line of pipes, so the conversion happens here,
 * before posting, for the small subset the drafter writes: "##"/"###"
 * headings, paragraphs, "- " lists, "> " quotes, pipe tables, **bold**,
 * *italic* and [text](url). Everything is escaped on the way in; only http(s)
 * links survive, so nothing a model writes can become markup or a script URL.
 */

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/** Bold, italic and links inside a line of text; the text itself is escaped first. */
function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) =>
    isSafeHref(href) ? `<a href="${href}" target="_blank" rel="noopener">${label}</a>` : label,
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return out;
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.includes("|") && (t.startsWith("|") || t.endsWith("|"));
}

function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line.trim());
}

function tableCells(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((cell) => cell.trim());
}

function tableAligns(separator: string): (string | null)[] {
  return tableCells(separator).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return left ? "left" : null;
  });
}

export function markdownToPartnerHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(" ").trim())}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) html.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
    list = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trimEnd();

    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushParagraph();
      flushList();
      const header = tableCells(line);
      const aligns = tableAligns(lines[i + 1]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i]) && lines[i].trim()) {
        const cells = tableCells(lines[i]);
        rows.push(header.map((_, c) => cells[c] ?? ""));
        i += 1;
      }
      i -= 1;
      const style = (c: number) => (aligns[c] ? ` style="text-align:${aligns[c]}"` : "");
      html.push(
        `<table><thead><tr>${header.map((cell, c) => `<th${style(c)}>${inline(cell)}</th>`).join("")}</tr></thead>` +
          `<tbody>${rows.map((row) => `<tr>${row.map((cell, c) => `<td${style(c)}>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
      );
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const tag = heading[1].length === 2 ? "h2" : "h3";
      html.push(`<${tag}>${inline(heading[2].trim())}</${tag}>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      list.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      flushList();
      html.push(`<blockquote><p>${inline(line.replace(/^>\s?/, ""))}</p></blockquote>`);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return html.join("\n");
}
