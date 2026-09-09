import "server-only";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

/**
 * Server-side event capture.
 *
 * This is the half of the analytics pipeline an ad blocker cannot switch off.
 * Client-side instrumentation gives depth — scroll, completion, shares — but a
 * meaningful share of readers block it entirely, and a reach figure that
 * silently excludes them is worse than useless because it looks plausible.
 *
 * What is deliberately NOT recorded here: no IP address, no user agent string,
 * no identifier of any kind. A row written by this function says a page was
 * served and nothing about who served it, which is why it needs no consent.
 * Consent is what later allows the client to attach a session to its own
 * events.
 */

type PageViewInput = {
  articleId?: string | null;
  categoryId?: string | null;
  path: string;
};

/** Coarse device class from client hints. The user agent itself is discarded. */
async function deviceType(): Promise<"mobile" | "tablet" | "desktop"> {
  const h = await headers();
  // Sec-CH-UA-Mobile is a structured boolean ('?1' / '?0'), far narrower than
  // parsing a user agent string and enough for the only distinction we report.
  if (h.get("sec-ch-ua-mobile") === "?1") return "mobile";

  const ua = h.get("user-agent") ?? "";
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|Android/i.test(ua)) return "mobile";
  return "desktop";
}

/**
 * Referrer host only — never the full URL.
 *
 * Referrer query strings routinely carry search terms and session identifiers
 * belonging to the referring site. Keeping only the host gives us the entry
 * point without inheriting somebody else's tracking.
 */
async function referrerHost(): Promise<string | null> {
  const h = await headers();
  const referer = h.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).host;
  } catch {
    return null;
  }
}

export async function logPageView({ articleId, categoryId, path }: PageViewInput) {
  try {
    const supabase = await createClient();
    await supabase.from("analytics_events").insert({
      event_type: "page_view",
      article_id: articleId ?? null,
      category_id: categoryId ?? null,
      path,
      referrer: await referrerHost(),
      device_type: await deviceType(),
      is_server_side: true,
    });
  } catch {
    // Analytics must never break a page. A reader losing an article because a
    // counter failed is a far worse outcome than a missing row.
  }
}
