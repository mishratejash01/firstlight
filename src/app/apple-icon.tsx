import { ImageResponse } from "next/og";

import { brandFonts } from "@/lib/brand/assets";
import { Monogram } from "@/lib/brand/monogram";

/** The icon an iPhone or iPad uses when a reader adds the site to the home screen. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(<Monogram size={size.width} />, {
    ...size,
    fonts: await brandFonts(),
  });
}
