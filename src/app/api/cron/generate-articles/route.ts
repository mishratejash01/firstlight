import { runAutonomousGeneration } from "@/lib/ai/autonomous";

/**
 * Scheduled autonomous publishing.
 *
 * Gated by CRON_SECRET. Without that check this would be a public URL that
 * anyone could call repeatedly to publish articles to the live site and run up
 * the model bill — the most consequential endpoint in the application.
 *
 * The run is a no-op unless `autonomous_publishing_enabled` is true in
 * site_settings, so the schedule can stay in place while the feature is off.
 */

export const dynamic = "force-dynamic";
// Several full-length articles per run; the default is nowhere near enough.
export const maxDuration = 300;

function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // An unset secret is a misconfiguration. Refusing is the safe reading;
  // defaulting to "allow" would leave publishing wide open.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorised(request)) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const report = await runAutonomousGeneration();

    return Response.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      enabled: report.enabled,
      publishedToday: report.publishedToday,
      dailyLimit: report.dailyLimit,
      published: report.outcomes.filter((o) => o.status === "published").length,
      failed: report.outcomes.filter((o) => o.status === "failed").length,
      // Surfaced in the run log so a growing number of unverifiable claims is
      // visible without opening the dashboard.
      unverifiedClaims: report.outcomes.reduce(
        (sum, o) => sum + (o.unverifiedClaimCount ?? 0),
        0,
      ),
      outcomes: report.outcomes,
    });
  } catch (error) {
    console.error("[autonomous] run failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Run failed" },
      { status: 500 },
    );
  }
}
