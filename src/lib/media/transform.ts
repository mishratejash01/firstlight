/**
 * Cloudinary delivery URL helpers.
 *
 * Safe to import anywhere — these build URLs from a public cloud name and hold
 * no credential.
 *
 * The point of rewriting the URL rather than serving the original is bandwidth:
 * a homepage of unresized 4000px photographs costs a fortune to deliver and is
 * slow on the phones most readers use. f_auto/q_auto lets Cloudinary pick the
 * format and compression per browser, and w_ caps the pixels actually sent.
 */

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

/** Widths matched to where an image is used, not to arbitrary breakpoints. */
export const IMAGE_PRESETS = {
  thumb: 400,
  card: 800,
  hero: 1600,
} as const;

export function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url || !CLOUD_NAME) return false;
  return url.includes(`/${CLOUD_NAME}/`) && url.includes("res.cloudinary.com");
}

/**
 * Inserts transformation parameters into an existing delivery URL.
 *
 * Returns the input untouched when it is not a Cloudinary URL, so seeded
 * placeholders and any legacy absolute URLs keep working rather than breaking
 * into a dead link.
 */
export function cloudinaryImage(
  url: string | null | undefined,
  preset: keyof typeof IMAGE_PRESETS = "card",
): string | null {
  if (!url) return null;
  if (!isCloudinaryUrl(url)) return url;

  const marker = "/upload/";
  const index = url.indexOf(marker);
  if (index === -1) return url;

  // Skip if a transformation is already present, rather than stacking a second
  // one on top and quietly double-resizing.
  const rest = url.slice(index + marker.length);
  if (/^[a-z]_[^/]+\//.test(rest)) return url;

  const width = IMAGE_PRESETS[preset];
  return `${url.slice(0, index)}${marker}f_auto,q_auto,c_limit,w_${width}/${rest}`;
}

/** A still frame from a video, for use as a poster image. */
export function cloudinaryVideoPoster(url: string | null | undefined): string | null {
  if (!url || !isCloudinaryUrl(url)) return null;
  return url.replace(/\.(mp4|webm|mov)$/i, ".jpg");
}
