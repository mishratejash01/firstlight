import type { Metadata } from "next";

import { SITE_LOCALE, SITE_NAME, absoluteUrl } from "@/lib/site";

/**
 * Metadata for a listing or standing page, built the same way everywhere.
 *
 * The title is the bare page name: the root layout's template appends
 * " - The India Decade", so a page that added the paper's name itself would
 * show it twice. The canonical URL is absolute on the canonical domain, and
 * the link-preview tags repeat the title and description so every network
 * shows the same thing a search result does. A page with no image of its own
 * inherits the generated default from app/opengraph-image.
 */
export function pageMetadata({
  title,
  description,
  path,
  noindex = false,
  rss,
}: {
  title: string;
  description?: string | null;
  path: string;
  noindex?: boolean;
  rss?: { url: string; title: string } | null;
}): Metadata {
  const url = absoluteUrl(path);
  const socialTitle = `${title} - ${SITE_NAME}`;
  // A page that sets its own Open Graph tags replaces the inherited ones
  // wholesale, image included, so the generated default is named here.
  const image = { url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: SITE_NAME };

  return {
    title,
    ...(description ? { description } : {}),
    alternates: {
      canonical: url,
      ...(rss ? { types: { "application/rss+xml": [rss] } } : {}),
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      title: socialTitle,
      ...(description ? { description } : {}),
      url,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      ...(description ? { description } : {}),
      images: [image.url],
    },
    // A page kept out of the index still passes its links on.
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * Words that are initialisms when they appear in a topic name. Topic names are
 * stored in lower case, so without this "us politics" would read "Us Politics".
 */
const INITIALISMS = new Set([
  "ai", "agi", "api", "bjp", "brics", "cbi", "ceo", "cji", "cpi", "eu", "ev", "evs", "fbi", "fifa",
  "g7", "g20", "gdp", "gst", "icc", "imf", "ipl", "ipo", "isro", "it", "llm", "llms", "nasa", "nato",
  "nda", "nfl", "nhs", "npa", "opec", "rbi", "sebi", "sec", "uae", "uk", "un", "upi", "us", "usa",
  "who", "wto",
]);

/** A stored lower-case topic name set in title case for headings and titles. */
export function displayTopicName(name: string): string {
  return name
    .split(/(\s+|-)/)
    .map((part) => {
      const lower = part.toLowerCase();
      if (INITIALISMS.has(lower)) return lower.toUpperCase();
      if (/^\s+$|^-$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}
