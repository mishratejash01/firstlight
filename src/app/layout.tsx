import {
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_LOCALE,
  SITE_NAME,
  SITE_URL,
  X_HANDLE,
} from "@/lib/site";
import type { Metadata, Viewport } from "next";
import { Inter, Libre_Franklin, Mona_Sans, Space_Grotesk } from "next/font/google";

import { AdSenseTag } from "@/components/ads/adsense-tag";
import { AnalyticsProvider } from "@/components/analytics/analytics-provider";
import { JsonLd } from "@/components/seo/json-ld";
import { siteGraphJsonLd } from "@/lib/seo/json-ld";
import "./globals.css";

// One family for the whole paper, the way the modern wire services set
// themselves. Libre Franklin descends from Franklin Gothic — the face
// newspapers have set decks and labels in for a century — so it carries a
// 52px headline and an 11px timestamp without needing a second family to help.
// Loaded as a variable font: one file, every weight.
// Space Grotesk carries the headlines: a grotesk with enough character in its
// letters to read as the paper's own voice at a glance, set semibold rather
// than bold so a page of forty headlines does not shout.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-headline-src",
  subsets: ["latin"],
  display: "swap",
});

// Mona Sans carries the descriptions under the headlines — the standfirst on a
// story, the line of copy on a card. Regular weight: it is there to be read
// after the headline, not to compete with it.
const monaSans = Mona_Sans({
  variable: "--font-dek-src",
  subsets: ["latin"],
  display: "swap",
});

// Inter names the sections. It is the most neutral grotesque there is, which is
// exactly what a label wants to be: read once, at a glance, and then got out of
// the way of the headline underneath it.
const inter = Inter({
  variable: "--font-label-src",
  subsets: ["latin"],
  display: "swap",
});

const libreFranklin = Libre_Franklin({
  variable: "--font-sans-src",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Search-console verification codes, set as environment variables once each
 * webmaster account exists. Absent, nothing is emitted: an empty verification
 * tag verifies nothing and only clutters the head.
 */
const verificationOther: Record<string, string> = {};
if (process.env.BING_SITE_VERIFICATION) {
  verificationOther["msvalidate.01"] = process.env.BING_SITE_VERIFICATION;
}

export const metadata: Metadata = {
  // Every relative URL in page metadata (canonical links, social images)
  // resolves against the canonical domain, never whatever host served the
  // request or the hosting provider's own address.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    // A hyphen rather than a pipe: Google rewrites titles that use pipes as
    // separators about twice as often.
    template: `%s - ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  publisher: SITE_NAME,
  category: "news",
  alternates: {
    types: {
      "application/rss+xml": [{ url: "/feed.xml", title: SITE_NAME }],
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
  },
  twitter: {
    card: "summary_large_image",
    ...(X_HANDLE ? { site: X_HANDLE } : {}),
  },
  // Let every search engine show large image previews and full-length
  // snippets: Google Discover only shows a large picture when
  // max-image-preview:large is allowed. Indexing itself needs no tag (it is the
  // default), which leaves pages that opt out, and error pages, with a single
  // unambiguous noindex rather than two tags that disagree.
  robots: {
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.YANDEX_SITE_VERIFICATION
      ? { yandex: process.env.YANDEX_SITE_VERIFICATION }
      : {}),
    ...(Object.keys(verificationOther).length ? { other: verificationOther } : {}),
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

/**
 * The longest any page is served from the cache before it is rebuilt: an
 * hour. Pages with nothing of their own that changes (About, Privacy) still
 * carry the header's section names, which an editor can change; the breaking
 * banner, the latest stories and the date come from the browser (see
 * lib/live-headlines). A rebuild that changes nothing costs nothing to store,
 * but each one is a function run on a plan with a monthly allowance of them.
 * Pages that need fresher content set a shorter time themselves.
 */
export const revalidate = 3600;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang={SITE_LANGUAGE}
      className={`${spaceGrotesk.variable} ${monaSans.variable} ${inter.variable} ${libreFranklin.variable}`}
    >
      <body>
        {/* Who publishes this page, the same on every page: name, logo,
            standards and corrections pages, and the website it belongs to. */}
        <JsonLd data={siteGraphJsonLd()} />
        {children}
        <AnalyticsProvider
          measurementId={process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID}
        />
        {/* Advertising, on the paper's pages only; the tag is hoisted into
            the head of the served HTML. */}
        <AdSenseTag client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT} />
      </body>
    </html>
  );
}
