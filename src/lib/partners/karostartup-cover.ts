import "server-only";

/**
 * A cover in Karostartup's own dress for a story no licensed photograph fits:
 * the headline set in their type on their paper, with their kicker and their
 * wordmark. Typographic on purpose. A startup rarely has a free picture of
 * itself, and a synthesised one would be a fabrication under their masthead.
 *
 * Their pages crop covers to 16:10, 4:3 and 1:1, so everything that matters
 * sits in the middle 880 pixels of a 1600 by 900 canvas.
 */

const WIDTH = 1600;
const HEIGHT = 900;
const SAFE_LEFT = 360;
const SAFE_WIDTH = 880;

/** Their stylesheet's tokens. */
const PAPER = "#fafaf8";
const INK = "#0a0a0a";
const BRAND = "#d10a11";
const MUTED = "#5a5a5a";
const FONT = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Character-count wrapping: close enough at this size without font metrics. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
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
  if (lines.join(" ").length < text.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]}…`;
  return lines;
}

export function buildKarostartupCover({ headline, kicker }: { headline: string; kicker: string }): string {
  const fontSize = headline.length > 95 ? 50 : headline.length > 70 ? 56 : 62;
  const maxChars = Math.floor(SAFE_WIDTH / (fontSize * 0.52));
  const lines = wrap(headline, maxChars, 4);
  const lineHeight = Math.round(fontSize * 1.16);
  const blockHeight = lines.length * lineHeight;
  const top = Math.round((HEIGHT - blockHeight) / 2) + 12;

  const headlineLines = lines
    .map(
      (line, index) =>
        `<text x="${SAFE_LEFT}" y="${top + fontSize + index * lineHeight}" font-family="${FONT}" font-size="${fontSize}" font-weight="700" letter-spacing="-0.5" fill="${INK}">${escapeXml(line)}</text>`,
    )
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>
  <rect x="${SAFE_LEFT}" y="${top - 58}" width="44" height="5" fill="${BRAND}"/>
  <text x="${SAFE_LEFT}" y="${top - 18}" font-family="${FONT}" font-size="22" font-weight="700" letter-spacing="2" fill="${BRAND}">${escapeXml(kicker.toUpperCase())}</text>
  ${headlineLines}
  <text x="${SAFE_LEFT}" y="${HEIGHT - 92}" font-family="${FONT}" font-size="26" font-weight="800" letter-spacing="1.5" fill="${INK}">KAR<tspan fill="${BRAND}">O</tspan>STARTUP</text>
  <text x="${SAFE_LEFT}" y="${HEIGHT - 58}" font-family="${FONT}" font-size="18" fill="${MUTED}">karostartup.com</text>
</svg>`;
}
