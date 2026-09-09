import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/**
 * Supabase client for Client Components (browser).
 *
 * Uses the publishable key, which is safe to ship to the browser — every table
 * it can reach is gated by Row Level Security. `createBrowserClient` is a
 * singleton internally, so calling this on every render is cheap.
 */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL(), SUPABASE_PUBLISHABLE_KEY());
}
