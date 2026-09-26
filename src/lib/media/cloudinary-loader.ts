"use client";

/**
 * The image loader for next/image: Cloudinary resizes, not Vercel.
 *
 * Every picture on the site is already a Cloudinary upload, and Cloudinary can
 * deliver it at any width, in the best format each browser accepts. Sending it
 * through Vercel's image optimiser as well meant every picture was resized
 * twice, and on the Hobby plan that optimiser stops accepting new images after
 * 5,000 transformations a month: new stories would then show broken pictures
 * until the month turned over. This loader asks Cloudinary for exactly the
 * width the browser picked from srcset and skips Vercel entirely.
 *
 * Any transformation already in the URL (a preset from cloudinaryImage) is
 * replaced rather than stacked. Pictures hosted anywhere else are returned
 * untouched: they are shown as they are, without resizing.
 */
export default function cloudinaryLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const marker = "/upload/";
  const index = src.indexOf(marker);
  if (!src.includes("res.cloudinary.com") || index === -1) return src;

  const head = src.slice(0, index + marker.length);
  let rest = src.slice(index + marker.length);
  // A leading transformation segment looks like "f_auto,q_auto,c_limit,w_800/".
  const firstSlash = rest.indexOf("/");
  if (firstSlash > 0 && /^[a-z]{1,3}_[^/]*$/.test(rest.slice(0, firstSlash))) {
    rest = rest.slice(firstSlash + 1);
  }

  // q_auto lets Cloudinary choose the compression per picture and per
  // browser, which beats a fixed quality number for photographs and cards.
  return `${head}f_auto,q_auto,c_limit,w_${width}/${rest}`;
}
