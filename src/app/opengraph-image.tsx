import { ImageResponse } from "next/og";

import {
  BRAND_HAIRLINE,
  BRAND_INK,
  BRAND_MUTED,
  BRAND_PAPER,
  NAMEPLATE_TRACKING,
  brandFonts,
} from "@/lib/brand/assets";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/**
 * The picture a link preview shows for any page without one of its own: the
 * front page, the sections, the standards pages. Stories carry their own lead
 * photograph instead. 1200 by 630 is the size every network crops to.
 */
export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAMEPLATE_SIZE = 104;

export default async function OpenGraphImage() {
  const tagline = SITE_TAGLINE.charAt(0).toUpperCase() + SITE_TAGLINE.slice(1);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND_PAPER,
          fontFamily: "Libre Franklin",
        }}
      >
        <div
          style={{
            display: "flex",
            color: BRAND_INK,
            fontWeight: 800,
            fontSize: NAMEPLATE_SIZE,
            letterSpacing: NAMEPLATE_SIZE * NAMEPLATE_TRACKING,
            lineHeight: 1,
          }}
        >
          {SITE_NAME}
        </div>
        <div
          style={{
            display: "flex",
            width: 160,
            height: 2,
            marginTop: 44,
            marginBottom: 36,
            background: BRAND_HAIRLINE,
          }}
        />
        <div
          style={{
            display: "flex",
            color: BRAND_MUTED,
            fontWeight: 400,
            fontSize: 36,
            lineHeight: 1.3,
          }}
        >
          {tagline}
        </div>
      </div>
    ),
    { ...size, fonts: await brandFonts() },
  );
}
