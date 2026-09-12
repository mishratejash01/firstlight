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

  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();

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
