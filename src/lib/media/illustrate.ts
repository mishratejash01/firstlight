import "server-only";

import { v2 as cloudinary } from "cloudinary";

import { createAdminClient } from "@/lib/supabase/admin";
import { attributionFor, searchLicensedImage } from "./openverse";
import { buildTypographicCard } from "./typographic-card";

/**
 * Gives an article a lead image.
 *
 * Order of preference:
 *   1. An openly licensed photograph matching the story's subject, credited.
 *   2. A generated typographic card.
 *
 * There is deliberately no third option. The photograph from the article we
 * read is not available to us — it belongs to the outlet or their agency — and
 * a synthesised photorealistic image of a real event is fabrication whatever
 * the caption says.
 *
 * Everything chosen is copied into our own Cloudinary account rather than
 * hotlinked. Hotlinking spends someone else's bandwidth and breaks the moment
 * they move the file, which on a news page means an article with a hole in it.
 */

export type Illustration = {
  url: string;
  alt: string;
  credit: string;
  kind: "photo" | "card";
};

function configureCloudinary(): boolean {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) return false;

  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return true;
}

async function uploadRemote(
  sourceUrl: string,
  folder: string,
): Promise<{ url: string; publicId: string; bytes: number } | null> {
  try {
    const result = await cloudinary.uploader.upload(sourceUrl, {
      folder,
      resource_type: "image",
      quality: "auto",
      fetch_format: "auto",
      // Crop to the shape every card and hero on the site expects, rather than
      // letting a 3:2 photograph decide the layout.
      transformation: [{ width: 1600, height: 900, crop: "fill", gravity: "auto" }],
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes ?? 0,
    };
  } catch (error) {
    console.error("[illustrate] upload failed", error);
    return null;
  }
}

async function uploadSvg(
  svg: string,
  folder: string,
): Promise<{ url: string; publicId: string; bytes: number } | null> {
  try {
    // Cloudinary rasterises SVG on upload, so the delivered asset is a normal
    // image rather than markup the browser has to trust.
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: "image",
      format: "png",
      quality: "auto",
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes ?? 0,
    };
  } catch (error) {
    console.error("[illustrate] card upload failed", error);
    return null;
  }
}

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T) ?? fallback;
}

/**
 * Builds the search phrase from what the story is actually about.
 *
 * Entities the model marked `about` are better search terms than the headline,
 * which is written to be read rather than to be matched — "Iran claims capture
 * of US underwater drone" finds nothing, "Strait of Hormuz" finds 240 images.
 */
function buildQuery(subjects: string[], fallback: string): string {
  const usable = subjects.map((s) => s.trim()).filter((s) => s.length > 2).slice(0, 2);
  return usable.length ? usable.join(" ") : fallback;
}

export async function illustrateArticle({
  headline,
  section,
  subjects,
  uploadedBy,
}: {
  headline: string;
  section: string;
  subjects: string[];
  uploadedBy?: string | null;
}): Promise<Illustration | null> {
  if (!configureCloudinary()) return null;

  const enabled = await readSetting<boolean>("illustration_enabled", true);
  if (!enabled) return null;

  const allowPhotos = await readSetting<boolean>("illustration_allow_photos", true);
  const supabase = createAdminClient();

  if (allowPhotos) {
    const query = buildQuery(subjects, section);
    const found = await searchLicensedImage(query);

    if (found) {
      const uploaded = await uploadRemote(found.url, "newswebsite/illustrations");
      if (uploaded) {
        const credit = attributionFor(found);

        await supabase.from("media_assets").insert({
          public_id: uploaded.publicId,
          secure_url: uploaded.url,
          resource_type: "image",
          bytes: uploaded.bytes,
          // The subject, not the headline: alt text describes the picture, not
          // the story it illustrates.
          alt_text: found.title ?? query,
          credit,
          licence: found.licence,
          licence_url: found.licenceUrl,
          creator: found.creator,
          source_url: found.sourceUrl,
          provider: found.provider,
          uploaded_by: uploadedBy ?? null,
        });

        return {
          url: uploaded.url,
          alt: found.title ?? query,
          credit,
          kind: "photo",
        };
      }
    }
  }

  // Nothing suitable and licensed. A generated card is honest about being a
  // graphic; a generated photograph would not be.
  const svg = buildTypographicCard({ headline, section });
  const uploaded = await uploadSvg(svg, "newswebsite/cards");
  if (!uploaded) return null;

  await supabase.from("media_assets").insert({
    public_id: uploaded.publicId,
    secure_url: uploaded.url,
    resource_type: "image",
    bytes: uploaded.bytes,
    alt_text: `${section}: ${headline}`,
    credit: "The Federal Post",
    provider: "generated",
    uploaded_by: uploadedBy ?? null,
  });

  return {
    url: uploaded.url,
    // Says what it is. A screen reader user should not be told this is a
    // photograph of the event.
    alt: `${section} — ${headline}`,
    credit: "The Federal Post",
    kind: "card",
  };
}
