import "server-only";

/**
 * A generated lead card, for stories where no suitably licensed photograph
 * exists.
 *
 * This is a typographic graphic — the headline set on the paper's own ink
 * background — and not a picture of anything. That is the point. The obvious
 * alternative is generating a photorealistic image of the event, and for news
 * that is fabrication: a synthesised photograph of a captured drone or a named
 * politician is indistinguishable from evidence and would be published under a
 * masthead that readers are meant to trust. No serious newsroom does it, and
 * this one will not either.
 *
 * A card that plainly reads as a card cannot be mistaken for a photograph of
 * something that happened.
 */

const WIDTH = 1200;
const HEIGHT = 675;

/** XML-escape, because the headline is untrusted text going into markup. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Wraps to fit the card.
 *
 * Character-count wrapping rather than real text measurement: without a font
 * metric library the alternative is a headline that overflows the canvas, and
 * an approximate break at a sensible width is close enough for a 1200px card.
 */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }

  if (current && lines.length < maxLines) lines.push(current);

  // Anything that did not fit is signalled rather than silently dropped.
  const used = lines.join(" ").length;
  if (used < text.length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1]}…`;
  }

  return lines;
}

export function buildTypographicCard({
  headline,
  section,
}: {
  headline: string;
  section: string;
}): string {
  // Longer headlines get smaller type, so the card stays balanced instead of
  // either overflowing or leaving half the canvas empty.
  const fontSize = headline.length > 90 ? 52 : headline.length > 60 ? 60 : 68;
  const maxChars = Math.floor((WIDTH - 160) / (fontSize * 0.5));
  const lines = wrap(headline, maxChars, 4);

  const lineHeight = Math.round(fontSize * 1.18);
  const blockHeight = lines.length * lineHeight;
  const startY = Math.round((HEIGHT - blockHeight) / 2) + fontSize;

  const headlineLines = lines
    .map(
      (line, index) =>
        `<text x="80" y="${startY + index * lineHeight}" ` +
        `font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" ` +
        `font-weight="600" fill="#FFFFFF">${escapeXml(line)}</text>`,
    )
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#14161C"/>
    <rect x="80" y="72" width="52" height="3" fill="#FFFFFF"/>
    <text x="80" y="112" font-family="Helvetica, Arial, sans-serif" font-size="21"
          letter-spacing="0.5" fill="#9AA0AC">${escapeXml(section)}</text>
    ${headlineLines}
    <text x="80" y="${HEIGHT - 64}" font-family="Helvetica, Arial, sans-serif"
          font-size="19" fill="#9AA0AC">The Federal Post</text>
  </svg>`;
}
