import { after, type NextRequest } from "next/server";

import { deviceTypeFrom, logPageView, referrerHost } from "@/lib/analytics/server-events";

/**
 * Page views, reported by the page itself.
 *
 * Article pages are served from the edge cache, so the server no longer
 * renders, and so no longer sees, each view. The page reports it instead, once,
 * when it is shown (components/analytics/page-view-beacon), and this writes the
 * same row the server used to write while rendering: the page, the time, a
 * coarse device class and the referring site's host. No identifier, IP address
 * or user agent is stored, which is why it needs no consent.
 *
 * On this site's own address rather than the database's, so the count is not
 * lost to a blocker that stops requests to third parties.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Crawlers and test tools that run scripts; a view by one of them is not a reader. */
const AUTOMATED = /bot|crawl|spider|slurp|lighthouse|pagespeed|headless/i;

function id(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }

  const path = body.path;
  if (typeof path !== "string" || !path.startsWith("/") || path.length > 300) {
    return new Response(null, { status: 400 });
  }

  if (AUTOMATED.test(request.headers.get("user-agent") ?? "")) {
    return new Response(null, { status: 204 });
  }

  // Read now: request headers are not available once the response has gone.
  const context = {
    deviceType: deviceTypeFrom(request.headers),
    referrer: referrerHost(typeof body.referrer === "string" ? body.referrer : null),
  };

  after(() =>
    logPageView({
      path,
      articleId: id(body.articleId),
      categoryId: id(body.categoryId),
      context,
    }),
  );

  return new Response(null, { status: 204 });
}
