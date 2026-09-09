import "server-only";

/**
 * Openly licensed image search.
 *
 * Deliberately NOT the photograph from the article we read. That image is a
 * separate copyrighted work, almost always licensed from an agency, and
 * republishing it is the clearest infringement available to a site like this —
 * a far more direct exposure than summarising the text with attribution.
 *
 * Openverse indexes Creative Commons and public domain images from Flickr,
 * Wikimedia and elsewhere. The search is filtered to licences that permit
 * commercial use and modification, because a news site is a commercial use and
 * we resize everything.
 */

export type LicensedImage = {
  url: string;
  title: string | null;
  creator: string | null;
  licence: string;
  licenceUrl: string | null;
  sourceUrl: string | null;
  provider: string;
  width: number | null;
  height: number | null;
};

/**
 * Licences we will actually use.
 *
 * NC (non-commercial) and ND (no-derivatives) are excluded at the API level,
 * but the response is checked again here: an ND image cannot be cropped to a
 * 16:9 card, which is the first thing we would do to it.
 */
const ACCEPTABLE = new Set([
  "cc0",
  "pdm",
  "by",
  "by-sa",
]);

function licenceIsUsable(licence: string | null | undefined): boolean {
  if (!licence) return false;
  // Openverse reports "by 2.0", "by-sa 3.0", "cc0 1.0" — the code is the first token.
  const code = licence.trim().toLowerCase().split(/\s+/)[0];
  return ACCEPTABLE.has(code);
}

/** Attribution text that satisfies a CC BY-style licence. */
export function attributionFor(image: LicensedImage): string {
  const parts: string[] = [];
  if (image.title) parts.push(`“${image.title}”`);
  if (image.creator) parts.push(`by ${image.creator}`);
  parts.push(`(${image.licence.toUpperCase()})`);
  if (image.provider) parts.push(`via ${image.provider}`);
  return parts.join(" ");
}

export async function searchLicensedImage(
  query: string,
): Promise<LicensedImage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  const url =
    "https://api.openverse.org/v1/images/" +
    `?q=${encodeURIComponent(query)}` +
    "&page_size=8" +
    // Commercial use and modification only.
    "&license_type=commercial,modification" +
    // Below this a hero crop looks like a thumbnail stretched to fit.
    "&size=medium,large" +
    "&mature=false";

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "TheFederalPostBot/1.0 (+https://newswebsite-pi.vercel.app)",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      results?: {
        url?: string;
        title?: string;
        creator?: string;
        license?: string;
        license_version?: string;
        license_url?: string;
        foreign_landing_url?: string;
        provider?: string;
        width?: number;
        height?: number;
      }[];
    };

    for (const result of data.results ?? []) {
      if (!result.url || !licenceIsUsable(result.license)) continue;

      // An attribution licence with nobody to attribute cannot be complied
      // with, so it is not usable however good the picture is.
      const code = (result.license ?? "").split(/\s+/)[0].toLowerCase();
      const needsCredit = code === "by" || code === "by-sa";
      if (needsCredit && !result.creator) continue;

      // Landscape only. A portrait photograph cropped to a 16:9 hero loses its
      // subject, which is worse than having no picture.
      if (result.width && result.height && result.height > result.width) continue;

      return {
        url: result.url,
        title: result.title ?? null,
        creator: result.creator ?? null,
        licence: [result.license, result.license_version].filter(Boolean).join(" "),
        licenceUrl: result.license_url ?? null,
        sourceUrl: result.foreign_landing_url ?? null,
        provider: result.provider ?? "Openverse",
        width: result.width ?? null,
        height: result.height ?? null,
      };
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
