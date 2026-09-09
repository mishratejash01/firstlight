"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser, isEditorial } from "@/lib/auth/roles";
import { ingestTrends } from "@/lib/trends/ingest";
import { triagePendingTrends } from "@/lib/trends/triage";
import { writeUpTrends } from "@/lib/trends/write-up";

/**
 * Trend controls.
 *
 * Manual triage exists because the automatic kind needs a model and may be
 * wrong. An editor overruling triage is the normal case, not an exception, so
 * marking a trend newsworthy or rejecting it is one press either way.
 */

type ActionResult = { error: string } | { ok: true; note?: string };

async function requireEditor() {
  const user = await getSessionUser();
  if (!user || !isEditorial(user)) return null;
  return user;
}

export async function setTrendStatus(formData: FormData): Promise<ActionResult> {
  const user = await requireEditor();
  if (!user) return { error: "Editorial role required." };

  const id = String(formData.get("trend_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!["pending", "newsworthy", "rejected"].includes(status)) {
    return { error: "Unknown status." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("trending_topics")
    .update({
      status,
      triage_reason:
        status === "newsworthy"
          ? "Marked newsworthy by an editor."
          : status === "rejected"
            ? "Rejected by an editor."
            : "Returned to the queue by an editor.",
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/trends");
  return { ok: true };
}

export async function addExclusion(formData: FormData): Promise<ActionResult> {
  const user = await requireEditor();
  if (!user) return { error: "Editorial role required." };

  const pattern = String(formData.get("pattern") ?? "").trim().toLowerCase();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!pattern) return { error: "Enter a term to exclude." };
  if (pattern.length < 3) {
    return { error: "Too short — a two-letter pattern would match almost everything." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("trend_exclusions")
    .insert({ pattern, reason: reason || null });

  if (error && error.code !== "23505") return { error: error.message };

  revalidatePath("/admin/trends");
  return { ok: true };
}

export async function removeExclusion(formData: FormData): Promise<ActionResult> {
  const user = await requireEditor();
  if (!user) return { error: "Editorial role required." };

  const id = String(formData.get("exclusion_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("trend_exclusions").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/trends");
  return { ok: true };
}

/** Polls, triages and writes in one go, for testing without waiting for cron. */
export async function runTrendsNow(): Promise<ActionResult> {
  const user = await requireEditor();
  if (!user) return { error: "Editorial role required." };

  try {
    const ingest = await ingestTrends();
    const triage = await triagePendingTrends(20);
    const writeUp = await writeUpTrends(3);

    const fetched = ingest.reduce((sum, r) => sum + r.fetched, 0);
    const inserted = ingest.reduce((sum, r) => sum + r.inserted, 0);
    const excluded = ingest.reduce((sum, r) => sum + r.excluded, 0);
    const failures = ingest.filter((r) => r.error);

    const parts = [
      `${fetched} trends checked, ${inserted} new, ${excluded} excluded`,
      triage.skippedNoAi
        ? "triage skipped — no AI configured, so new trends are waiting for you below"
        : `${triage.newsworthy} newsworthy, ${triage.rejected} rejected`,
      writeUp.outcomes.length
        ? `${writeUp.outcomes.filter((o) => o.status === "published" || o.status === "drafted").length} written`
        : "",
      failures.length ? `failed: ${failures.map((f) => f.error).join("; ")}` : "",
    ].filter(Boolean);

    revalidatePath("/admin/trends");
    return { ok: true, note: parts.join(" · ") };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Run failed." };
  }
}
