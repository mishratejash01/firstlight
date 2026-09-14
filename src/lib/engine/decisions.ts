import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The decision ledger and the decision-time snapshot.
 *
 * Every choice the desk makes about an event is written down with the score
 * and the reason at the moment of choosing, and the event's signals are
 * snapshotted at the same moment. The daily fit learns from those snapshots,
 * not from what the event looks like later, because by the time a verdict on
 * a story exists its signals have moved on.
 *
 * Neither call may ever break the desk. Both swallow their own errors and log
 * them: a story that was written but not recorded is a gap in the ledger; a
 * story that was not written because the ledger failed is a missed story.
 */

export type DecisionKind =
  | "triage_accept"
  | "triage_reject"
  | "triage_excluded"
  | "triage_failed"
  | "fast_lane"
  | "timing_wait"
  | "write_start"
  | "duplicate"
  | "stale"
  | "held"
  | "write_failed"
  | "written";

let cachedVersion: { id: number | null; at: number } | null = null;

/** The promoted selection model in force, cached for five minutes. */
async function currentModelVersion(): Promise<number | null> {
  if (cachedVersion && Date.now() - cachedVersion.at < 5 * 60_000) return cachedVersion.id;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("model_versions")
    .select("id")
    .eq("kind", "selection")
    .eq("promoted", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  cachedVersion = { id: data?.id ?? null, at: Date.now() };
  return cachedVersion.id;
}

export async function recordDecision(
  eventId: string,
  kind: DecisionKind,
  opts: {
    score?: number | null;
    rank?: number | null;
    reason?: string | null;
    details?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("desk_decisions").insert({
      event_id: eventId,
      kind,
      score: opts.score ?? null,
      rank: opts.rank ?? null,
      reason: opts.reason ?? null,
      model_version: await currentModelVersion(),
      details: (opts.details ?? null) as never,
    });
    if (error) console.error("[decisions] insert failed", error.message);
  } catch (error) {
    console.error("[decisions] insert threw", error instanceof Error ? error.message : error);
  }
}

export async function snapshotEvent(
  eventId: string,
  trigger: "triage" | "write" | "fast_lane",
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc("engine_snapshot", {
      p_event_id: eventId,
      p_trigger: trigger,
    });
    if (error) console.error("[decisions] snapshot failed", error.message);
  } catch (error) {
    console.error("[decisions] snapshot threw", error instanceof Error ? error.message : error);
  }
}
