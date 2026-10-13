import "server-only";

import type { LicensedImage } from "./openverse";

/**
 * Pexels: free photographs for any use, with the photographer credited and
 * linked. It has far more of India than the Commons scene searches reach —
 * markets, clinics, classrooms, streets — and every picture comes with a
 * written description, which is what the judge compares against the story.
 *
 * Unused without PEXELS_API_KEY. Free keys allow 200 requests an hour and
 * 20,000 a month; the desk sends at most two queries a story.
 */

const ENDPOINT = "https://api.pexels.com/v1/search";

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string | null;
  src: { original: string; large2x: string; large: string; medium: string; small: string; landscape: string };
};

export function pexelsConfigured(): boolean {
  return Boolean(process.env.PEXELS_API_KEY);
}

export async function searchPexels(query: string, limit = 8): Promise<LicensedImage[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query.trim()) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      `${ENDPOINT}?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${Math.min(Math.max(limit, 1), 20)}`,
      { headers: { Authorization: key }, signal: controller.signal },
    );
    if (!response.ok) return [];
    const data = (await response.json()) as { photos?: PexelsPhoto[] };
    return (data.photos ?? [])
      .filter((photo) => photo.width >= 1200 && photo.src?.large2x)
      .map((photo) => ({
        url: photo.src.large2x,
        thumbUrl: photo.src.medium,
        title: photo.alt?.trim() || null,
        creator: photo.photographer || null,
        licence: "Pexels licence",
        licenceUrl: "https://www.pexels.com/license/",
        sourceUrl: photo.url,
        provider: "pexels",
        width: photo.width,
        height: photo.height,
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
