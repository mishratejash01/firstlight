import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { SITE_NAME } from "@/lib/site";

/**
 * Everything the generated brand images share: the favicon, the app icons, the
 * publisher logos search engines read from structured data, and the default
 * picture shown when a page without its own image is shared.
 *
 * They are drawn from code rather than committed as picture files so they can
 * never disagree with the masthead. The nameplate is Libre Franklin ExtraBold
 * with the tracking pulled in, exactly as the site header sets it, and the
 * letters come from SITE_NAME, so renaming the paper redraws every one of them.
 */

export const BRAND_INK = "#14161c";
export const BRAND_PAPER = "#ffffff";
export const BRAND_MUTED = "#5b5f6b";
export const BRAND_HAIRLINE = "#e4e5e8";

/** The nameplate's tracking, the same -0.04em the header uses. */
export const NAMEPLATE_TRACKING = -0.04;

/**
 * The monogram for spaces too small for the full name: the initials of the
 * words that carry it, skipping a leading article. "The India Decade" -> "ID".
 */
export const MONOGRAM = SITE_NAME.split(/\s+/)
  .filter((word, index) => !(index === 0 && /^the$/i.test(word)))
  .map((word) => word.charAt(0).toUpperCase())
  .join("");

/** The name broken for a stacked, square lockup: one word per line. */
export const NAMEPLATE_LINES = SITE_NAME.split(/\s+/);

const FONT_DIR = join(process.cwd(), "src/assets/fonts");

type BrandFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 800;
  style: "normal";
};

let fonts: Promise<BrandFont[]> | null = null;

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

/**
 * The two cuts the images need, read once per process. TTF rather than the
 * WOFF2 the site serves, because the image renderer cannot read WOFF2.
 */
export function brandFonts(): Promise<BrandFont[]> {
  fonts ??= Promise.all([
    readFile(join(FONT_DIR, "LibreFranklin-800.ttf")),
    readFile(join(FONT_DIR, "LibreFranklin-400.ttf")),
  ]).then(([heavy, regular]) => [
    { name: "Libre Franklin", data: toArrayBuffer(heavy), weight: 800, style: "normal" },
    { name: "Libre Franklin", data: toArrayBuffer(regular), weight: 400, style: "normal" },
  ]);
  return fonts;
}
