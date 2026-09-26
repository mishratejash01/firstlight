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
  "4g", "5g", "6g", "aap", "ai", "agi", "aiadmk", "aiims", "api", "asean", "bcci", "bjp", "brics",
  "bse", "bsf", "bsp", "caa", "cbi", "cbse", "ceo", "cji", "cm", "cpi", "cpu", "crpf", "cuet", "dmk",
  "drdo", "eu", "ev", "evm", "evms", "evs", "f1", "fbi", "fdi", "fifa", "g7", "g20", "gdp", "gpu",
  "gpus", "gst", "hdfc", "ias", "iaf", "icc", "icici", "iim", "iit", "imd", "imf", "ipl", "ipo",
  "ips", "isl", "isro", "it", "jee", "lic", "llm", "llms", "mea", "mla", "mlas", "mp", "mps", "nasa",
  "nato", "nba", "ncp", "nda", "neet", "nfl", "nhs", "nia", "npa", "nrc", "nse", "nta", "ntpc",
  "odi", "ongc", "opec", "pg", "pm", "pmo", "psu", "psus", "rbi", "rjd", "rss", "saarc", "sbi",
  "sco", "sebi", "sec", "ssc", "t20", "tmc", "uae", "uapa", "uefa", "ufc", "ug", "ugc", "uk", "un",
  "upi", "upsc", "us", "usa", "who", "wpl", "wto",
]);

/** Names with their own capitalisation, which title case would get wrong. */
const PROPER_FORMS = new Map([
  ["bytedance", "ByteDance"], ["chatgpt", "ChatGPT"], ["deepseek", "DeepSeek"], ["ebay", "eBay"],
  ["fedex", "FedEx"], ["github", "GitHub"], ["indigo", "IndiGo"], ["ios", "iOS"], ["ipad", "iPad"],
  ["iphone", "iPhone"], ["linkedin", "LinkedIn"], ["macos", "macOS"], ["openai", "OpenAI"],
  ["paypal", "PayPal"], ["phonepe", "PhonePe"], ["playstation", "PlayStation"], ["pok", "PoK"],
  ["spacex", "SpaceX"], ["tiktok", "TikTok"], ["whatsapp", "WhatsApp"], ["xai", "xAI"],
  ["youtube", "YouTube"],
]);

/** Short words title case leaves in lower case unless they open the name. */
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to",
  "vs", "with",
]);

/**
 * A stored lower-case topic name set in title case for headings and titles:
 * "reserve bank of india" reads "Reserve Bank of India", "bcci" reads "BCCI"
 * and "openai" reads "OpenAI".
 */
export function displayTopicName(name: string): string {
  return name
    .split(/(\s+|[-‐‑])/)
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (/^\s+$|^[-‐‑]$/.test(part) || !part) return part;
      if (INITIALISMS.has(lower)) return lower.toUpperCase();
      const proper = PROPER_FORMS.get(lower);
      if (proper) return proper;
      if (index > 0 && MINOR_WORDS.has(lower)) return lower;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}
