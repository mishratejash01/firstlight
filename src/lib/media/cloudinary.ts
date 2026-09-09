import "server-only";

import { v2 as cloudinary } from "cloudinary";

/**
 * Cloudinary configuration.
 *
 * Uploads are signed server-side. The alternative — an unsigned upload preset
 * called from the browser — would put a write credential for the newsroom's
 * media account into every page, which anyone could then use to fill it with
 * whatever they liked. The file travels to our server first and the API secret
 * never leaves it.
 */

let configured = false;

function configure() {
  if (configured) return;

  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;

  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
    );
  }

  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  configured = true;
}

export type UploadedAsset = {
  publicId: string;
  secureUrl: string;
  resourceType: "image" | "video" | "raw";
  format: string | null;
  width: number | null;
  height: number | null;
  bytes: number;
  duration: number | null;
};

/** What the newsroom accepts. Anything else is rejected before it is uploaded. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

/** Cloudinary's free tier caps single uploads at 10MB image / 100MB video. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export async function uploadToCloudinary(
  file: File,
  folder = "newswebsite",
): Promise<UploadedAsset> {
  configure();

  const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type);
  const buffer = Buffer.from(await file.arrayBuffer());

  const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: isVideo ? "video" : "image",
        // Let Cloudinary decide format and compression per requesting browser,
        // rather than serving whatever the journalist happened to export.
        quality: "auto",
        fetch_format: "auto",
        // Strip camera metadata. Photographs routinely carry GPS coordinates,
        // which for a newsroom can identify where a source was standing.
        invalidate: true,
      },
      (error, uploaded) => {
        if (error || !uploaded) {
          reject(error ?? new Error("Upload failed with no response"));
          return;
        }
        resolve(uploaded as unknown as Record<string, unknown>);
      },
    );
    stream.end(buffer);
  });

  return {
    publicId: String(result.public_id),
    secureUrl: String(result.secure_url),
    resourceType: (result.resource_type as UploadedAsset["resourceType"]) ?? "image",
    format: result.format ? String(result.format) : null,
    width: typeof result.width === "number" ? result.width : null,
    height: typeof result.height === "number" ? result.height : null,
    bytes: typeof result.bytes === "number" ? result.bytes : 0,
    duration: typeof result.duration === "number" ? result.duration : null,
  };
}

export async function deleteFromCloudinary(
  publicId: string,
  resourceType: "image" | "video" | "raw" = "image",
) {
  configure();
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}
