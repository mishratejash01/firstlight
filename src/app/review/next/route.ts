import { NextResponse } from "next/server";

import { publicOrigin } from "@/lib/auth/origin";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, isEditorial } from "@/lib/auth/roles";

/**
 * The next story to review, or the queue page when there is none.
 *
 * The queue is computed for the caller by the database, so two reviewers
 * working at once are handed different stories where the queue allows and
 * the same one only when a second opinion is wanted.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser();
  const origin = publicOrigin(request);
  if (!user) return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent("/review")}`);
  if (!user.roles.includes("reviewer") && !isEditorial(user)) return NextResponse.redirect(`${origin}/account`);

  const supabase = await createClient();
  const { data } = await supabase.rpc("engine_review_queue", { p_limit: 1 });
  const next = data?.[0];
  if (!next) return NextResponse.redirect(`${origin}/review?done=1`);
  return NextResponse.redirect(`${origin}/review/${next.slug}`);
}
