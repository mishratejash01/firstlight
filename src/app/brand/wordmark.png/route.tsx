import { ImageResponse } from "next/og";

import { brandFonts } from "@/lib/brand/assets";
import { NameplateWide } from "@/lib/brand/nameplate";

/**
 * The one-line nameplate at 600 by 60, the publisher logo inside article
 * markup. Built once at deploy time.
 */
export const dynamic = "force-static";

const WIDTH = 600;
const HEIGHT = 60;

export async function GET() {
  return new ImageResponse(<NameplateWide height={HEIGHT} />, {
    width: WIDTH,
    height: HEIGHT,
    fonts: await brandFonts(),
  });
}
