import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { SITE_URL } from "@/lib/site";

/**
 * Sign in with Google, run from this site rather than from Supabase's.
 *
 * Google tells the reader which site they are signing in to by naming the
 * address it will send them back to. Through Supabase's hosted flow that was
 * the database's address, so readers were asked to continue to
 * "...supabase.co". Here Google sends them back to this site
 * (/auth/google/callback), which exchanges the code for Google's signed
 * identity token and hands that to Supabase (signInWithIdToken). Supabase
 * still holds the accounts and sessions; only the conversation with Google
 * moved. A Google account's ID is the same whichever client signs it in, so
 * existing readers keep their accounts.
 */

/** Short-lived cookie carrying state, nonce and PKCE verifier across the trip to Google. */
export const GOOGLE_FLOW_COOKIE = "nw_google_flow";

/** Ten minutes: long enough to choose an account, short enough not to linger. */
export const GOOGLE_FLOW_MAX_AGE = 600;

export type GoogleFlow = {
  state: string;
  nonce: string;
  verifier: string;
  next: string | null;
};

export function googleClient(): { id: string; secret: string } | null {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

/**
 * Where Google sends the reader back to. It must match a redirect URI
 * registered on the Google client exactly, so it is always the canonical
 * address, except on this machine during development.
 */
export function googleCallbackUrl(requestOrigin: string): string {
  const local = /^http:\/\/localhost(:\d+)?$/.test(requestOrigin);
  return `${local ? requestOrigin : SITE_URL}/auth/google/callback`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 of a string, as base64url (the PKCE challenge form). */
export function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

/** SHA-256 of a string, as hex (the nonce form Supabase compares against). */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function readGoogleFlow(raw: string | undefined): GoogleFlow | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GoogleFlow>;
    if (typeof parsed.state !== "string" || typeof parsed.nonce !== "string" || typeof parsed.verifier !== "string") {
      return null;
    }
    return {
      state: parsed.state,
      nonce: parsed.nonce,
      verifier: parsed.verifier,
      next: typeof parsed.next === "string" ? parsed.next : null,
    };
  } catch {
    return null;
  }
}
