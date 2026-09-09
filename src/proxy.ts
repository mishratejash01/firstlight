import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Runs before every matched request. Its only job is keeping the Supabase auth
 * token fresh — authorisation itself is enforced by RLS in the database and by
 * explicit checks in server code, never here. Proxy is an optimistic layer and
 * must not be treated as a security boundary.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files, which never carry a
     * session and would only add latency.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
