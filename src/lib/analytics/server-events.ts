import "server-only";

import { headers } from "next/headers";

import { createAnonymousClient } from "@/lib/supabase/anonymous";

/**
 * Server-side event capture.
 *
 * This is the half of the analytics pipeline an ad blocker cannot switch off.
 * Client-side instrumentation gives depth — scroll, completion, shares — but a
 * meaningful share of readers block it entirely, and a reach figure that
 * silently excludes them is worse than useless because it looks plausible.
 *
 * What is deliberately NOT recorded: no IP address, no user agent string, no
 * identifier of any kind. A row written here says a page was served and nothing
 * about who, which is why it needs no consent. Consent is what later allows the
 * client to attach a session to its own events.
 *
 * IMPORTANT: request context must be captured with captureRequestContext()
 * BEFORE handing work to after(). Next.js forbids cookies() and headers()
 * inside an after() callback, and the write itself therefore uses the
 * session-less client rather than the cookie-bound one.
 */

export type RequestContext = {
  deviceType: "mobile" | "tablet" | "desktop";
  referrer: string | null;
};

/**
 * Reads what we need from the request. Call this during render, never inside
 * after().
 *
 * Device class comes from Sec-CH-UA-Mobile where the browser sends it — a
 * structured boolean, far narrower than parsing a user agent — falling back to
 * a coarse UA test. The user agent itself is read and discarded, never stored.
 *
 * Only the referrer host is kept. Referrer query strings routinely carry search
 * terms and session identifiers belonging to the referring site; keeping the
 * host gives us the entry point without inheriting somebody else's tracking.
 */
export async function captureRequestContext(): Promise<RequestContext> {
  const h = await headers();

  let deviceType: RequestContext["deviceType"] = "desktop";
  if (h.get("sec-ch-ua-mobile") === "?1") {
    deviceType = "mobile";
  } else {
    const ua = h.get("user-agent") ?? "";
    if (/iPad|Tablet/i.test(ua)) deviceType = "tablet";
    else if (/Mobi|Android/i.test(ua)) deviceType = "mobile";
  }

  let referrer: string | null = null;
  const referer = h.get("referer");
  if (referer) {
    try {
      referrer = new URL(referer).host;
    } catch {
      referrer = null;
    }
  }

  return { deviceType, referrer };
}

export async function logPageView({
  articleId,
  categoryId,
  path,
  context,
}: {
  articleId?: string | null;
  categoryId?: string | null;
  path: string;
  context: RequestContext;
}) {
  try {
    const supabase = createAnonymousClient();
    const { error } = await supabase.from("analytics_events").insert({
      event_type: "page_view",
      article_id: articleId ?? null,
      category_id: categoryId ?? null,
      path,
      referrer: context.referrer,
      device_type: context.deviceType,
      is_server_side: true,
    });
    if (error) throw error;
  } catch (error) {
    // Analytics must never break a page. But a silently broken pipeline is how
    // you end up trusting an empty dashboard, so failures are logged rather
    // than swallowed outright.
    console.error("[analytics] page_view capture failed", error);
  }
}

/**
 * Internal site search.
 *
 * Recorded with the result count so that "searched and found nothing" is
 * distinguishable from "searched and read something" — the first is a content
 * gap, the second is not.
 */
export async function logSearch({
  query,
  resultCount,
  context,
}: {
  query: string;
  resultCount: number;
  context: RequestContext;
}) {
  try {
    const supabase = createAnonymousClient();
    const { error } = await supabase.from("analytics_events").insert({
      event_type: "internal_search",
      search_query: query,
      path: "/search",
      properties: { result_count: resultCount },
      referrer: context.referrer,
      device_type: context.deviceType,
      is_server_side: true,
    });
    if (error) throw error;
  } catch (error) {
    console.error("[analytics] internal_search capture failed", error);
  }
}
