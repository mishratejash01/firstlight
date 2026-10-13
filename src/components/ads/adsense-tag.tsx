"use client";

import { usePathname } from "next/navigation";

/**
 * The paths that are the newsroom rather than the paper: nobody advertises on
 * the desk, and AdSense's automatic placements would otherwise put
 * advertisements on them like any other page.
 */
const NEWSROOM = ["/admin", "/desk", "/review", "/contribute", "/account", "/auth", "/login"];

/**
 * Google AdSense's one script, on the paper's pages.
 *
 * Rendered as the plain tag AdSense documents, not through next/script: the
 * site check Google runs reads the served HTML for exactly this tag, and React
 * hoists an async script into the head of the server-rendered page and loads
 * it once however many times it is rendered. The publisher id comes from the
 * environment, so the same build serves a site with no advertising when it is
 * unset.
 */
export function AdSenseTag({ client }: { client?: string }) {
  const pathname = usePathname();
  if (!client) return null;
  if (NEWSROOM.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;
  return (
    <script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`}
      crossOrigin="anonymous"
    />
  );
}
