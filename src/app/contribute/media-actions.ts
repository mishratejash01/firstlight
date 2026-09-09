"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser, isEditorial } from "@/lib/auth/roles";
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  uploadToCloudinary,
} from "@/lib/media/cloudinary";

/**
 * Media upload.
 *
 * The file is validated here, before it reaches Cloudinary, because the browser
 * `accept` attribute is a convenience for the person choosing a file and not a
 * control — it is trivially bypassed, and an upload endpoint that trusts it
 * accepts whatever anyone cares to post.
 */

export type UploadResult =
  | {
      ok: true;
      url: string;
      resourceType: "image" | "video" | "raw";
      publicId: string;
      altText: string;
    }
  | { ok: false; error: string };

function describeSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export async function uploadMedia(formData: FormData): Promise<UploadResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!isEditorial(user) && !user.roles.includes("author")) {
    return { ok: false, error: "You do not have permission to upload media." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }

  const altText = String(formData.get("alt_text") ?? "").trim();
  const credit = String(formData.get("credit") ?? "").trim();

  const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);
  const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type);

  if (!isImage && !isVideo) {
    return {
      ok: false,
      error: `${file.type || "That file type"} is not supported. Use JPEG, PNG, WebP, AVIF, GIF, MP4, WebM or MOV.`,
    };
  }

  const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    return {
      ok: false,
      error: `That file is ${describeSize(file.size)}. The limit is ${describeSize(limit)}.`,
    };
  }

  // Alt text is required for images. An image published without it is invisible
  // to anyone using a screen reader, and asking at upload time is the only
  // point where the person actually knows what the picture shows.
  if (isImage && !altText) {
    return { ok: false, error: "Describe the image so screen reader users know what it shows." };
  }

  let asset;
  try {
    asset = await uploadToCloudinary(file);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The upload failed. Try again.",
    };
  }

  // Record it. A failure here is not worth discarding a completed upload over —
  // the file is already live and usable — but it is worth logging, because the
  // media library will be missing a row.
  const supabase = await createClient();
  const { error } = await supabase.from("media_assets").insert({
    public_id: asset.publicId,
    secure_url: asset.secureUrl,
    resource_type: asset.resourceType,
    format: asset.format,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    duration: asset.duration,
    alt_text: altText || null,
    credit: credit || null,
    uploaded_by: user.id,
  });

  if (error) {
    console.error("[media] uploaded to Cloudinary but not recorded", error);
  }

  return {
    ok: true,
    url: asset.secureUrl,
    resourceType: asset.resourceType,
    publicId: asset.publicId,
    altText,
  };
}
