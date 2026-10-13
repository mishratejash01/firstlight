/**
 * A case study's cover: the question, set large on the paper's tinted ground
 * with the subject named above it, in the shape the site shares pages at
 * (1200 by 675). The same cover serves the library, the front-page shelf and
 * the social share, so the section reads as one thing rather than as
 * whatever photographs the libraries happened to have.
 *
 * Built as SVG and rasterised by Cloudinary on upload, like the typographic
 * cards for stories without pictures (lib/media/typographic-card).
 */

const WIDTH = 1200;
const HEIGHT = 675;
const MARGIN = 88;

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Greedy wrap by an estimated glyph width; the last line is marked if anything did not fit. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  const used = lines.join(" ").length;
  if (used < text.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]}…`;
  return lines;
}

export function buildCaseStudyCover({
  question,
  subject,
  siteName,
}: {
  question: string;
  subject: string;
  siteName: string;
}): string {
  const fontSize = question.length > 90 ? 60 : question.length > 60 ? 70 : 82;
  const maxChars = Math.floor((WIDTH - MARGIN * 2) / (fontSize * 0.48));
  const lines = wrap(question, maxChars, 4);
  const lineHeight = Math.round(fontSize * 1.1);
  const blockHeight = lines.length * lineHeight;
  const startY = Math.round((HEIGHT - blockHeight) / 2) + fontSize * 0.8;

  const headline = lines
    .map(
      (line, index) =>
        `<text x="${MARGIN}" y="${startY + index * lineHeight}" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="700" letter-spacing="-1" fill="#14161C">${escapeXml(line)}</text>`,
    )
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#EFF1F5"/>
  <rect x="0" y="0" width="14" height="${HEIGHT}" fill="#1B3B6F"/>
  <rect x="${MARGIN}" y="78" width="56" height="4" fill="#1B3B6F"/>
  <text x="${MARGIN + 72}" y="90" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700" fill="#1B3B6F">CASE STUDY</text>
  <text x="${MARGIN + 72 + 170}" y="90" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#5B5F6B">·  ${escapeXml(subject)}</text>
  ${headline}
  <text x="${MARGIN}" y="${HEIGHT - 70}" font-family="Helvetica, Arial, sans-serif" font-size="22" letter-spacing="1" fill="#5B5F6B">${escapeXml(siteName)}</text>
  <circle cx="${WIDTH - MARGIN - 24}" cy="${HEIGHT - 78}" r="26" fill="#F85F05"/>
</svg>`;
}
