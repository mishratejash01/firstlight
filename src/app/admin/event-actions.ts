"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser, isEditorial } from "@/lib/auth/roles";
import { recordOutcome } from "@/lib/engine/learn";
import { runPulse } from "@/lib/engine/pulse";
import { triageCandidates } from "@/lib/engine/triage";
import { writeEvents } from "@/lib/engine/write";

/**
 * Desk controls for the event engine.
 *
 * An editor's decision here is recorded twice: once as the event's new
 * status, and once as a label the weights learn from. Overruling the engine
 * is how it gets better, so the two are one press.
 */

type ActionResult = { error: string } | { ok: true; note?: string };

async function requireEditor() {
  const user = await getSessionUser();
  if (!user || !isEditorial(user)) return null;
  return user;
}

export async function setEventStatus(formData: FormData): Promise<ActionResult> {
  const user = await requireEditor();
  if (!user) return { error: "Editorial role required." };

  const id = String(formData.get("event_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!["newsworthy", "rejected", "candidate"].includes(status)) {
    return { error: "Unknown status." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("story_events")
    .update({
      status,
      triage_reason:
        status === "newsworthy"
          ? "Marked newsworthy by an editor."
          : status === "rejected"
            ? "Rejected by an editor."
            : "Returned to the candidates by an editor.",
      // A fresh decision clears the write history, so an event an editor
      // promotes after three failed attempts gets tried again.
      write_attempts: status === "newsworthy" ? 0 : undefined,
      claimed_at: status === "newsworthy" ? null : undefined,
      last_error: null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  if (status === "newsworthy") await recordOutcome(id, "editor", 1);
  if (status === "rejected") await recordOutcome(id, "editor", 0);

  revalidatePath("/admin/events");
  return { ok: true };
}

/** One full turn of the engine, now: poll, cluster, score, triage, write. */
export async function runEngineNow(): Promise<ActionResult> {
  const user = await requireEditor();
  if (!user) return { error: "Editorial role required." };

  try {
    const pulse = await runPulse("fast");
    const triage = await triageCandidates(4);
    const write = await writeEvents(1);

    const written = write.outcomes.filter((o) => o.status === "published" || o.status === "drafted");
    const held = write.outcomes.filter((o) => o.status === "held");

    revalidatePath("/admin/events");
    return {
      ok: true,
      note: [
        `${pulse.cluster?.inserted ?? 0} new mentions, ${pulse.cluster?.joined ?? 0} joined existing events`,
        `${pulse.scoring.scored} events scored`,
        `${triage.newsworthy} passed triage, ${triage.rejected} rejected`,
        written.length ? `${written.length} written` : held.length ? `1 held: ${held[0].reason}` : "nothing written",
      ].join(" · "),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Engine run failed." };
  }
}
