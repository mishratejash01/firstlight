import "server-only";

import { wikidataCoordinates } from "@/lib/engine/wikidata";

import type { LicensedImage } from "./openverse";

/**
 * A map of where the story happened, for an incident or a place with no
 * honest photograph: a derailment in Punjab, a shooting in Mansa, a naming
 * row over Ladakh. Papers run these; a reader learns where, and nobody is
 * shown a stand-in for the event.
 *
 * Rendered by Geoapify's static map service from OpenStreetMap data, with
 * the attribution the licence requires drawn on the image. Unused without
 * GEOAPIFY_API_KEY. The free plan allows 3,000 credits a day; a map with
 * one marker costs two.
 */

const ENDPOINT = "https://maps.geoapify.com/v1/staticmap";

/** How close to look, from what the place is. */
function zoomFor(description: string | null): number {
  const d = (description ?? "").toLowerCase();
  if (/\bcountry\b|sovereign state/.test(d)) return 4;
  if (/\bstate\b|\bprovince\b|\bregion\b|union territory/.test(d)) return 6;
  if (/\bdistrict\b|\bdivision\b/.test(d)) return 8;
  if (/\bcity\b|\btown\b|\bvillage\b|municipal|capital|metropolis/.test(d)) return 10;
  return 8;
}

export function mapsConfigured(): boolean {
  return Boolean(process.env.GEOAPIFY_API_KEY);
}

export async function placeMap({
  name,
  qid,
  description,
}: {
  name: string;
  qid: string;
  description: string | null;
}): Promise<LicensedImage | null> {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) return null;
  const at = await wikidataCoordinates(qid);
  if (!at) return null;
  const zoom = zoomFor(description);
  const url =
    `${ENDPOINT}?style=osm-bright&width=1600&height=900&format=jpeg` +
    `&center=lonlat:${at.lon},${at.lat}&zoom=${zoom}` +
    `&marker=lonlat:${at.lon},${at.lat};color:%23cc0000;size:large` +
    `&apiKey=${encodeURIComponent(key)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    // Fetched here and handed on as bytes, so the key in the URL never leaves this process.
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 10_000) return null;
    return {
      url: `data:image/jpeg;base64,${bytes.toString("base64")}`,
      thumbUrl: null,
      title: `Map: ${name}`,
      creator: "© OpenStreetMap contributors, Geoapify",
      licence: "ODbL",
      licenceUrl: "https://www.openstreetmap.org/copyright",
      sourceUrl: `https://www.openstreetmap.org/#map=${zoom}/${at.lat}/${at.lon}`,
      provider: "openstreetmap",
      width: 1600,
      height: 900,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
