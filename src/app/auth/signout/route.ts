import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Sign-out is POST-only on purpose. As a GET it can be triggered by any image
 * or link on another site, which makes logging someone out a one-click prank
 * and, worse, a way to force a re-auth at a moment of the attacker's choosing.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}
