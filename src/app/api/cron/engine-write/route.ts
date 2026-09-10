import { triageCandidates } from "@/lib/engine/triage";
import { writeEvents } from "@/lib/engine/write";

/**
 * The engine's desk: triage what the scoring surfaced, then write the best of
 * what passed.
 *
 * Separate from the pulse because writing is slow — reading sources, the
 * verification pass, drafting, illustrating — and the pulse has to finish
 * inside a minute. Called every few minutes by pg_cron, gated by CRON_SECRET.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorised(request)) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 1), 1), 3);

  try {
    const triage = await triageCandidates();
    const write = await writeEvents(limit);
    return Response.json({ ok: true, triage, write });
  } catch (error) {
    console.error("[engine-write] failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Engine write failed" },
      { status: 500 },
    );
  }
}
