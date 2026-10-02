import { ImageResponse } from "next/og";

import { doveDataUri } from "@/lib/brand/assets";

/**
 * The site icon, in the sizes that matter: the orange dove disc, the same mark
 * as on the sign-in card and the paper's X and Instagram accounts.
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
  const dove = await doveDataUri();

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <img src={dove} width={px} height={px} alt="" />
      </div>
    ),
    { width: px, height: px },
  );
}
