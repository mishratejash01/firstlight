import { ImageResponse } from "next/og";

import { BRAND_ORANGE, doveDataUri } from "@/lib/brand/assets";

/**
 * The icon an iPhone or iPad uses when a reader adds the site to the home
 * screen: the white dove on a full orange square. Full-bleed rather than the
 * disc on transparency, because iOS fills transparent corners with black and
 * rounds the square itself.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const dove = await doveDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: BRAND_ORANGE,
        }}
      >
        <img src={dove} width={170} height={170} alt="" />
      </div>
    ),
    { ...size },
  );
}
