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

/**
 * A fixed-shape crop for machines rather than readers: search engines'
 * structured data, link previews and feed readers.
 *
 * Google asks article images to come in 16:9, 4:3 and 1:1 at 1200 pixels wide
 * or more; link previews want 1200 by 630. JPEG rather than f_auto because
 * these URLs are fetched by crawlers and social networks that do not all
 * negotiate formats, and g_auto keeps the subject inside whatever the crop
 * cuts away.
 *
 * Returns null for anything that is not an untransformed Cloudinary upload, so
 * callers fall back to the original URL rather than invent dimensions for it.
 */
export function cloudinaryCrop(
  url: string | null | undefined,
  width: number,
  height: number,
): string | null {
  if (!url || !isCloudinaryUrl(url)) return null;

  const marker = "/upload/";
  const index = url.indexOf(marker);
  if (index === -1) return null;

  const rest = url.slice(index + marker.length);
  if (/^[a-z]_[^/]+\//.test(rest)) return null;

  return `${url.slice(0, index)}${marker}f_jpg,q_auto:good,c_fill,g_auto,w_${width},h_${height}/${rest}`;
}

/** The three shapes Google asks for, each 1200 pixels wide. */
export const ARTICLE_IMAGE_SHAPES = [
  { width: 1200, height: 675 },
  { width: 1200, height: 900 },
  { width: 1200, height: 1200 },
] as const;

/**
 * The link-preview shape for a story: 16:9 at 1200 pixels wide, which is what
 * Google Discover asks for, and which social networks crop only slightly.
 */
export const SHARE_IMAGE_SHAPE = { width: 1200, height: 675 } as const;

/** A still frame from a video, for use as a poster image. */
export function cloudinaryVideoPoster(url: string | null | undefined): string | null {
  if (!url || !isCloudinaryUrl(url)) return null;
  return url.replace(/\.(mp4|webm|mov)$/i, ".jpg");
}
