import { NextResponse, type NextRequest } from "next/server";

import {
  GOOGLE_FLOW_COOKIE,
  GOOGLE_FLOW_MAX_AGE,
  googleCallbackUrl,
  googleClient,
  randomToken,
  sha256Base64Url,
  sha256Hex,
  type GoogleFlow,
} from "@/lib/auth/google";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";

/**
 * Starts Sign in with Google: sends the reader to Google's account chooser,
 * which names this site as the one they are continuing to.
 *
 * Three one-time values travel with the trip, kept in a cookie only this site
 * can read: a state value that the return must echo (so nobody can plant a
 * sign-in on a reader), a nonce that Google writes into its identity token (so
 * a token cannot be replayed), and a PKCE verifier (so an intercepted code is
 * useless on its own).
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const client = googleClient();
  if (!client) {
    return NextResponse.redirect(`${origin}/auth/error?reason=unavailable`);
  }

  const next = request.nextUrl.searchParams.get("next");
  const flow: GoogleFlow = {
    state: randomToken(),
    nonce: randomToken(),
    verifier: randomToken(48),
    next: next ? safeRedirectPath(next) : null,
  };

  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({
    client_id: client.id,
    redirect_uri: googleCallbackUrl(origin),
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    // Supabase checks the token's nonce against the hash of the one it is
    // given, so Google gets the hash and Supabase, later, the original.
    nonce: sha256Hex(flow.nonce),
    code_challenge: sha256Base64Url(flow.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const response = NextResponse.redirect(google);
  response.cookies.set(GOOGLE_FLOW_COOKIE, JSON.stringify(flow), {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/auth/google",
    maxAge: GOOGLE_FLOW_MAX_AGE,
  });
  return response;
}
