import "server-only";

import { SITE_URL } from "@/lib/site";

/**
 * The address the reader is actually on, for building redirects back to it.
 *
 * Behind the server's proxy, Next.js names the request after the port it
 * listens on (https://localhost:3000), not the host the reader typed, and it
 * deliberately ignores the Host header. So redirects built from request.url
 * sent readers to localhost. The proxy passes the real host and scheme in
 * X-Forwarded-Host and X-Forwarded-Proto; those are believed only when they
 * name the canonical address or one of the other addresses the paper is
 * served at (SITE_ALIAS_ORIGINS), so a forged header can never point a
 * redirect at someone else's site. Anything else gets the canonical address,
 * except plain http on this machine during development.
 */
const KNOWN_ORIGINS = new Set(
  [SITE_URL, ...(process.env.SITE_ALIAS_ORIGINS ?? "").split(",")]
    .map((origin) => origin.trim().replace(/\/+$/, "").toLowerCase())
    .filter(Boolean),
);

export function publicOrigin(request: Request): string {
  const first = (value: string | null) => value?.split(",")[0]?.trim().toLowerCase();
  const host = first(request.headers.get("x-forwarded-host")) ?? first(request.headers.get("host"));
  const own = new URL(request.url);
  const scheme = first(request.headers.get("x-forwarded-proto")) ?? own.protocol.replace(/:$/, "");

  if (host) {
    const claimed = `${scheme}://${host}`;
    if (KNOWN_ORIGINS.has(claimed)) return claimed;
  }
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(own.origin)) return own.origin;
  return SITE_URL;
}
