import { BRAND_INK, BRAND_PAPER, MONOGRAM, NAMEPLATE_TRACKING } from "@/lib/brand/assets";

/**
 * The square monogram mark: the paper's initials, white on ink.
 *
 * Used for the favicon and the home-screen icons, where the full nameplate
 * would be an unreadable smear. The letters fill a little over half the square
 * so they still read at 32 pixels in a browser tab.
 */
export function Monogram({ size }: { size: number }) {
  const fontSize = Math.round(size * 0.58);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_INK,
        color: BRAND_PAPER,
        fontFamily: "Libre Franklin",
        fontWeight: 800,
        fontSize,
        letterSpacing: fontSize * NAMEPLATE_TRACKING,
        lineHeight: 1,
        // The cap height sits above the line box's centre; a nudge down puts
        // the letters in the optical middle of the square.
        paddingTop: Math.round(size * 0.04),
      }}
    >
      {MONOGRAM}
    </div>
  );
}
