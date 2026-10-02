import { runPulse } from "@/lib/engine/pulse";
import { metered } from "@/lib/engine/metered";

/**
 * The engine's heartbeat.
 *
 * Called every minute by pg_cron from inside the database (via pg_net), and
 * every fifteen minutes with ?cadence=slow. Gated by CRON_SECRET like every
 * other scheduled endpoint: this one spends embedding quota and makes requests
 * to a dozen third parties, and must not be triggerable by anyone who finds
 * the URL.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!isAuthorised(request)) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }

  const cadence = new URL(request.url).searchParams.get("cadence") === "slow" ? "slow" : "fast";

  try {
    const report = await runPulse(cadence);
    return Response.json({ ok: true, ...report });
  } catch (error) {
    console.error("[pulse] failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Pulse failed" },
      { status: 500 },
    );
  }
}

// The reply carries what the run cost; see lib/engine/metered.
export const GET = metered(handle);
