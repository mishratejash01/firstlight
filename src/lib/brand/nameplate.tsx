import {
  BRAND_INK,
  BRAND_PAPER,
  NAMEPLATE_LINES,
  NAMEPLATE_TRACKING,
} from "@/lib/brand/assets";
import { SITE_NAME } from "@/lib/site";

/**
 * The nameplate as an image, in the two shapes search engines ask for.
 *
 * Square, stacked one word to a line, is the publisher logo in Organization
 * markup: it has to read on a plain white ground at 112 pixels and up. Wide,
 * on one line, is the logo inside article markup, where the long-standing
 * guidance is a 600 by 60 rectangle.
 */
export function NameplateStacked({ size }: { size: number }) {
  const fontSize = Math.round(size / (NAMEPLATE_LINES.length + 1.4));

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_PAPER,
        color: BRAND_INK,
        fontFamily: "Libre Franklin",
        fontWeight: 800,
        fontSize,
        letterSpacing: fontSize * NAMEPLATE_TRACKING,
        lineHeight: 1,
      }}
    >
      {NAMEPLATE_LINES.map((line) => (
        <div key={line} style={{ display: "flex" }}>
          {line}
        </div>
      ))}
    </div>
  );
}

export function NameplateWide({ height }: { height: number }) {
  const fontSize = Math.round(height * 0.72);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_PAPER,
        color: BRAND_INK,
        fontFamily: "Libre Franklin",
        fontWeight: 800,
        fontSize,
        letterSpacing: fontSize * NAMEPLATE_TRACKING,
        lineHeight: 1,
      }}
    >
      {SITE_NAME}
    </div>
  );
}
