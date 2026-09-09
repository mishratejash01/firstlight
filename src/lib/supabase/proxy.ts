import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/**
 * Refreshes the Supabase auth session on every matched request.
 *
 * Server Components cannot write cookies, so without this the access token
 * would expire and never be renewed. This runs in `proxy.ts` (Next.js 16's
 * rename of middleware) where cookies *can* be written, and does two things:
 *
 *   1. writes the refreshed token back onto the request, so Server Components
 *      rendering later in the same pass see the new token;
 *   2. writes it onto the response, so the browser stores it.
 *
 * `setAll` also receives cache headers that must be copied onto the response.
 * Without them a CDN could cache a response carrying a Set-Cookie auth token
 * and serve one user's session to another.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL(),
    SUPABASE_PUBLISHABLE_KEY(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Triggers the refresh. `getClaims` verifies the JWT signature rather than
  // trusting the cookie, which is why it — and never `getSession` — is what
  // server code may rely on.
  await supabase.auth.getClaims();

  return response;
}
