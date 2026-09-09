import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "./database.types";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Acts as the signed-in user: it reads the auth cookie and every query is
 * therefore subject to Row Level Security. This is the client to reach for by
 * default — `admin.ts` is the deliberate exception, not the norm.
 *
 * A new client must be created per request because it closes over that
 * request's cookies. `cookies()` is async in Next.js 16.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL(), SUPABASE_PUBLISHABLE_KEY(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. This is expected and safe
          // to ignore: `proxy.ts` refreshes the session on every request, so
          // the refreshed token still reaches the browser.
        }
      },
    },
  });
}
