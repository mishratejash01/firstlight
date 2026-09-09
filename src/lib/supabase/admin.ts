import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

import { SUPABASE_URL } from "./env";

/**
 * Privileged Supabase client that BYPASSES Row Level Security.
 *
 * The `server-only` import above is load-bearing: if any file that reaches the
 * client bundle ever imports this module, the build fails rather than shipping
 * the secret key to browsers. A leaked secret key is a full database
 * compromise.
 *
 * Legitimate uses are narrow:
 *   - the wire-feed ingestion worker writing to the staging table
 *   - admin role management, where the caller's own RLS would block the write
 *   - server-side aggregate analytics reads
 *
 * Anything acting on behalf of a signed-in user must use `server.ts` instead,
 * so that RLS remains the enforcement layer. Every call site here is
 * responsible for its own authorisation check.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      "Missing environment variable SUPABASE_SECRET_KEY. This key is server-only and must never be prefixed with NEXT_PUBLIC_.",
    );
  }

  return createSupabaseClient<Database>(SUPABASE_URL(), secretKey, {
    auth: {
      // No user session to persist or refresh — this client is not a user.
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
