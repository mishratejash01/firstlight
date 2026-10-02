import { createAdminClient } from "@/lib/supabase/admin";
import { ingestTrends } from "@/lib/trends/ingest";
import { triagePendingTrends } from "@/lib/trends/triage";
import { writeUpTrends } from "@/lib/trends/write-up";
import { metered } from "@/lib/engine/metered";

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

async function handle(request: Request) {
  if (!isAuthorised(request)) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const ingest = await ingestTrends();

    // Triage and writing only while this pipeline is the one that writes.
    // With the event engine doing both, running them here as well would
    // spend the model quota twice on the same stories. Ingestion stays on so
    // the trends page keeps showing what people are searching for.
    const supabase = createAdminClient();
    const { data: setting } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "trending_auto_write")
      .maybeSingle();
    const autoWrite = Boolean(setting?.value);

    const triage = autoWrite ? await triagePendingTrends(20) : null;
    const writeUp = autoWrite ? await writeUpTrends(3) : null;

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

// The reply carries what the run cost; see lib/engine/metered.
export const GET = metered(handle);
