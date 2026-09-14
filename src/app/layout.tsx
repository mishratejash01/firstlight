import { SITE_NAME } from "@/lib/site";
import type { Metadata } from "next";
import { Inter, Libre_Franklin, Newsreader } from "next/font/google";

import { AnalyticsProvider } from "@/components/analytics/analytics-provider";
import "./globals.css";

// One family for the whole paper, the way the modern wire services set
// themselves. Libre Franklin descends from Franklin Gothic — the face
// newspapers have set decks and labels in for a century — so it carries a
// 52px headline and an 11px timestamp without needing a second family to help.
// Loaded as a variable font: one file, every weight.
// Newsreader carries the headlines. It was drawn for news and has an
// optical-size axis, so a 54px splash and a 17px rail headline are genuinely
// different cuts rather than one shape scaled — the large sizes tighten and
// sharpen, the small ones open up and stay legible. One family covers the whole
// scale without a page of forty headlines looking like one shape repeated.
const newsreader = Newsreader({
  variable: "--font-serif-src",
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

export const metadata: Metadata = {
  title: SITE_NAME,
  description: "General-interest news reporting.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${inter.variable} ${libreFranklin.variable}`}
    >
      <body>
        {children}
        <AnalyticsProvider
          measurementId={process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID}
        />
      </body>
    </html>
  );
}
