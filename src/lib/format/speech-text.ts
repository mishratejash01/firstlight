/**
 * An article body as something to be read aloud.
 *
 * The body is stored in the site's small Markdown subset. A speech engine
 * given the raw source would read "hash hash" for a heading and spell out
 * link URLs, so this strips the markup down to the words, one entry per
 * block, in reading order. Pictures and video are dropped: their captions
 * describe what a listener cannot see and only interrupt the story.
 *
 * Deliberately independent of the renderer. The renderer's job is to be safe
 * against hostile markup; this one's job is to sound right, and the two
 * should be free to change without each other.
 */
export function markdownToSpeech(markdown: string): string[] {
  const blocks: string[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      const text = clean(paragraph.join(" "));
      if (text) blocks.push(text);
      paragraph = [];
    }
  };

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    // A table is read a row at a time, each figure paired with its column
    // heading — "BJP: 2019 303, 2024 240." — the way a person reading it out
    // would say it. Read raw, it would come out as "pipe BJP pipe 303 pipe".
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flush();
      const header = tableCells(line);
      i += 2;
      while (i < lines.length && lines[i].trim() && isTableRow(lines[i])) {
        const [first, ...rest] = tableCells(lines[i]);
        const pairs = rest
          .map((cell, c) => (cell ? `${header[c + 1] ?? ""} ${cell}`.trim() : ""))
          .filter(Boolean)
          .join(", ");
        const text = clean(pairs ? `${first}: ${pairs}` : first);
        if (text) blocks.push(`${text}.`);
        i += 1;
      }
      i -= 1;
      continue;
    }

    if (!line) {
      flush();
      continue;
    }
    // Media blocks: skipped entirely, caption included.
    if (/^!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) {
      flush();
      continue;
    }
    // Headings, list items and quotes each stand as their own block so the
    // engine pauses before and after them, the way a reader's voice would.
    const heading = line.match(/^#{2,3}\s+(.*)$/);
    const listItem = line.match(/^-\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);
    if (heading || listItem || quote) {
      flush();
      const text = clean((heading ?? listItem ?? quote)![1]);
      if (text) blocks.push(text);
      continue;
    }

    paragraph.push(line);
  }
  flush();

  return blocks;
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.includes("|") && (t.startsWith("|") || t.endsWith("|"));
}

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

/** Inline markup to words: links keep their text, emphasis marks go. */
function clean(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Minutes to listen, at the pace a newsreader keeps. */
export function listeningMinutes(blocks: string[]): number {
  const words = blocks.reduce((sum, block) => sum + block.split(/\s+/).length, 0);
  return Math.max(1, Math.round(words / 150));
}
