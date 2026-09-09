import type { Metadata } from "next";
import { Libre_Franklin } from "next/font/google";

import { AnalyticsProvider } from "@/components/analytics/analytics-provider";
import "./globals.css";

// One family for the whole paper, the way the modern wire services set
// themselves. Libre Franklin descends from Franklin Gothic — the face
// newspapers have set decks and labels in for a century — so it carries a
// 52px headline and an 11px timestamp without needing a second family to help.
// Loaded as a variable font: one file, every weight.
const libreFranklin = Libre_Franklin({
  variable: "--font-sans-src",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Newswebsite",
  description: "General-interest news reporting.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={libreFranklin.variable}>
      <body>
        {children}
        <AnalyticsProvider
          measurementId={process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID}
        />
      </body>
    </html>
  );
}
