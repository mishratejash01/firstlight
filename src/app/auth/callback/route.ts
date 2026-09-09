import { NextResponse } from "next/server";

import { safeRedirectPath } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { dashboardHomeFor, getSessionUser } from "@/lib/auth/roles";

/**
 * OAuth landing point. Google returns the reader here with a one-time code,
 * which is exchanged for a session and written into cookies.
 *
 * With no `next`, the reader is routed by role: an editor lands on the desk, a
 * contributor on their drafts, someone with no role on their account page.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/error?reason=exchange_failed`);
  }

  if (next) {
    return NextResponse.redirect(`${origin}${safeRedirectPath(next)}`);
  }

  const user = await getSessionUser();
  return NextResponse.redirect(`${origin}${user ? dashboardHomeFor(user) : "/"}`);
}
