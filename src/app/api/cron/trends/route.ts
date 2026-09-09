import { ingestTrends } from "@/lib/trends/ingest";
import { triagePendingTrends } from "@/lib/trends/triage";
import { writeUpTrends } from "@/lib/trends/write-up";

/**
 * The trends pipeline, end to end: poll, triage, write.
 *
 * Each stage is independent and reports separately, so a failure in triage does
 * not hide what ingestion found, and a model outage does not look like "no
 * trends today".
 *
 * Gated by CRON_SECRET like the other scheduled endpoints.
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

  const startedAt = Date.now();

  try {
    const ingest = await ingestTrends();
    const triage = await triagePendingTrends(20);
    const writeUp = await writeUpTrends(3);

    return Response.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ingest,
      triage,
      writeUp,
    });
  } catch (error) {
    console.error("[trends] pipeline failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Pipeline failed" },
      { status: 500 },
    );
  }
}
