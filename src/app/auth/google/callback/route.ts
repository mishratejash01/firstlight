import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { GOOGLE_FLOW_COOKIE, googleCallbackUrl, googleClient, readGoogleFlow } from "@/lib/auth/google";
import { dashboardHomeFor, getSessionUser } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Google sends the reader back after they choose an account.
 *
 * Checks the state value against the one set when the trip began, exchanges
 * the one-time code for Google's signed identity token (with the client
 * secret, which never leaves the server), and gives that token to Supabase,
 * which verifies Google's signature, the audience and the nonce, finds or
 * creates the account, and sets the session cookies.
 *
 * With no `next`, the reader is routed by role, as after any sign-in: an
 * editor lands on the desk, a contributor on their drafts, anyone else on
 * their account page.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  const cookieStore = await cookies();
  const flow = readGoogleFlow(cookieStore.get(GOOGLE_FLOW_COOKIE)?.value);
  // One trip, one use: the values are spent whatever happens next.
  cookieStore.delete({ name: GOOGLE_FLOW_COOKIE, path: "/auth/google" });

  const fail = (reason: string) => NextResponse.redirect(`${origin}/auth/error?reason=${reason}`);

  if (params.get("error")) return fail("cancelled");
  const code = params.get("code");
  if (!code) return fail("missing_code");
  if (!flow || params.get("state") !== flow.state) return fail("expired");

  const client = googleClient();
  if (!client) return fail("unavailable");

  let idToken: string | undefined;
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: client.id,
        client_secret: client.secret,
        redirect_uri: googleCallbackUrl(origin),
        grant_type: "authorization_code",
        code_verifier: flow.verifier,
      }),
      cache: "no-store",
    });
    const body = (await response.json()) as { id_token?: string };
    idToken = response.ok ? body.id_token : undefined;
  } catch {
    idToken = undefined;
  }
  if (!idToken) return fail("exchange_failed");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: flow.nonce,
  });
  if (error) {
    console.error("[auth] google sign-in rejected", error.message);
    return fail("exchange_failed");
  }

  if (flow.next) return NextResponse.redirect(`${origin}${flow.next}`);
  const user = await getSessionUser();
  return NextResponse.redirect(`${origin}${user ? dashboardHomeFor(user) : "/"}`);
}
