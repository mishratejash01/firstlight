/**
 * Validated access to Supabase environment variables.
 *
 * Reading `process.env.X!` inline everywhere hides misconfiguration until a
 * query mysteriously 401s in production. These helpers fail loudly at the
 * point of use instead.
 *
 * Only the URL and the publishable key are exposed to the browser. The secret
 * key deliberately lives in `admin.ts`, which is guarded by `server-only`.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.local.example to .env.local and fill it in.`,
    );
  }
  return value;
}

// Inlined at build time by Next.js, so these must be referenced as full
// literal property accesses rather than through a computed key.
export const SUPABASE_URL = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const SUPABASE_PUBLISHABLE_KEY = () =>
  required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
