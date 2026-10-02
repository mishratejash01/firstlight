import { ingestAllWireSources } from "@/lib/wire/ingest";
import { metered } from "@/lib/engine/metered";

/**
 * Scheduled wire ingestion.
 *
 * Invoked by Vercel Cron. The endpoint runs as the service role, so it is
 * gated: Vercel signs its own cron invocations with CRON_SECRET, and without
 * that check this would be a public URL that anyone could hammer to make us
 * fetch third-party feeds on demand.
 *
 * Returns a per-source report rather than a bare 200. A feed that has quietly
 * started failing should be visible in the cron log, not merely absent from the
 * queue.
 */

export const dynamic = "force-dynamic";
// Feeds are slow and there may be several; the default 15s is not enough.
export const maxDuration = 120;

function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  // Refuse rather than run unprotected. An unset secret in production is a
  // misconfiguration, and defaulting to "allow" is how it stays unnoticed.
  if (!secret) return false;

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!isAuthorised(request)) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const reports = await ingestAllWireSources();

    return Response.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      sources: reports.length,
      inserted: reports.reduce((sum, r) => sum + r.inserted, 0),
      updated: reports.reduce((sum, r) => sum + r.updated, 0),
      skipped: reports.reduce((sum, r) => sum + r.skipped, 0),
      failures: reports.filter((r) => r.error).map((r) => ({ source: r.sourceSlug, error: r.error })),
      reports,
    });
  } catch (error) {
    console.error("[wire] ingestion run failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Ingestion failed" },
      { status: 500 },
    );
  }
}

// The reply carries what the run cost; see lib/engine/metered.
export const GET = metered(handle);
