import { ImageResponse } from "next/og";

import { brandFonts } from "@/lib/brand/assets";
import { NameplateStacked } from "@/lib/brand/nameplate";

/**
 * The square publisher logo, at a stable address.
 *
 * NewsMediaOrganization markup on every page points here. Google asks for at
 * least 112 by 112 pixels on a white ground; 512 leaves room for any display.
 * Built once at deploy time.
 */
export const dynamic = "force-static";

const SIZE = 512;

export async function GET() {
  return new ImageResponse(<NameplateStacked size={SIZE} />, {
    width: SIZE,
    height: SIZE,
    fonts: await brandFonts(),
  });
}
