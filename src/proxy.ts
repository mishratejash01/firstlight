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
     * Only the pages that act as the signed-in reader: the newsroom's own
     * areas, sign-in and its callback, and the account page. Topic and writer
     * pages used to be here because their follow buttons read the reader's
     * state on the server; the buttons now read it in the browser, so those
     * pages are cached like the rest.
     *
     * Public pages read nothing about the reader on the server, and running
     * this in front of them cost a function call and an auth check on every
     * page view, before the cache could answer. A signed-in reader's session
     * is still kept fresh on those pages, by the browser's own Supabase client
     * in the account menu.
     */
    "/admin/:path*",
    "/desk/:path*",
    "/review/:path*",
    "/contribute/:path*",
    "/account/:path*",
    "/auth/:path*",
    "/login",
  ],
};
