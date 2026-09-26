import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/**
 * A session-less server client that acts as the anonymous role.
 *
 * Exists for two things that must not involve a reader's session:
 *
 *   - Reads for public pages. Everything a public page shows is what an
 *     anonymous reader may see, and reading it through the cookie-bound client
 *     in server.ts calls cookies(), which makes Next.js render the page afresh
 *     for every visit. Through this client the page can be cached and served
 *     from the edge, which is most of the difference between a page arriving
 *     in half a second and in fifty milliseconds.
 *   - Writes that deliberately have no user attached, such as the actorless
 *     page tally, where a session would attach a person to a row that is
 *     supposed to have none.
 *
 * This is NOT a privileged client. It holds the publishable key, so RLS applies
 * exactly as it does for any reader: it may append events and cannot read them
 * back.
 */
export function createAnonymousClient() {
  return createSupabaseClient<Database>(SUPABASE_URL(), SUPABASE_PUBLISHABLE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
