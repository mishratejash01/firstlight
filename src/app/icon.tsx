import { ImageResponse } from "next/og";

import { brandFonts } from "@/lib/brand/assets";
import { Monogram } from "@/lib/brand/monogram";

/**
 * The site icon, in the sizes that matter.
 *
 * 48 and 96 because Google shows a site's favicon beside its search results and
 * asks for a square that is a multiple of 48 pixels; 192 and 512 because those
 * are what phones and the web app manifest ask for. Generated at build time and
 * served as static files.
 */
const SIZES = [48, 96, 192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map((px) => ({
    id: String(px),
    size: { width: px, height: px },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const px = Number(await id);

  return new ImageResponse(<Monogram size={px} />, {
    width: px,
    height: px,
    fonts: await brandFonts(),
  });
}
