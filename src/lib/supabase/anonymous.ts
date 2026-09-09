import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/**
 * A session-less server client that acts as the anonymous role.
 *
 * Exists for writes that deliberately have no user attached — the actorless
 * page tally, chiefly. The cookie-bound client in server.ts cannot be used for
 * those: it calls cookies(), which Next.js forbids inside an after() callback,
 * and it would attach a session to a row that is supposed to have none.
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
