import { coverPartnerPost, runPartnerDesk } from "@/lib/engine/partner-desk";
import { metered } from "@/lib/engine/metered";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The partner desk's pass for karostartup.com (see lib/engine/partner-desk),
 * called by the scheduler every twenty minutes. For an administrator with the
 * secret:
 *   ?dry=1          show what the desk would pick and its queue, without writing
 *   ?now=1          post the desk's own pick now, whatever the hour and the spacing
 *   ?event=<uuid>   write this event now, past the gate and the spacing rule
 *   ?cover=<slug>   look for a cover for a story posted without one
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!isAuthorised(request)) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const supabase = createAdminClient();
  const { data: leased } = await supabase.rpc("engine_try_lock", { p_name: "partner-karostartup", p_ttl_seconds: 300 });
  if (!leased) return Response.json({ ok: true, skipped: "another pass holds the partner desk" });

  try {
    const cover = params.get("cover")?.trim();
    if (cover) return Response.json({ ok: true, cover: await coverPartnerPost(cover) });
    const report = await runPartnerDesk({
      dry: params.get("dry") === "1",
      now: params.get("now") === "1",
      eventId: params.get("event")?.trim() || undefined,
    });
    return Response.json({ ok: true, ...report });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  } finally {
    await supabase.rpc("engine_release_lock", { p_name: "partner-karostartup" });
  }
}

export const GET = metered(handle);
export const POST = metered(handle);
