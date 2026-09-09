"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser, isEditorial } from "@/lib/auth/roles";
import { runAutonomousGeneration } from "@/lib/ai/autonomous";

/**
 * Autonomous publishing controls.
 *
 * Topic management is an editorial job; changing the settings that govern
 * automatic publishing — whether it runs at all, and how much it may publish —
 * is an admin one. A topic is a brief; the switch is a policy.
 */

type ActionResult = { error: string } | { ok: true; note?: string };

async function requireEditor() {
  const user = await getSessionUser();
  if (!user || !isEditorial(user)) return null;
  return user;
}

async function requireAdminUser() {
  const user = await getSessionUser();
  if (!user || !user.roles.includes("admin")) return null;
  return user;
}

export async function addTopic(formData: FormData): Promise<ActionResult> {
  const user = await requireEditor();
  if (!user) return { error: "Editorial role required." };

  const topic = String(formData.get("topic") ?? "").trim();
  const angle = String(formData.get("angle") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "");
  const cadence = Number(formData.get("cadence_hours") ?? 24);

  if (!topic) return { error: "Describe the topic." };
  if (!categoryId) return { error: "Choose a section." };
  if (!Number.isFinite(cadence) || cadence < 1 || cadence > 8760) {
    return { error: "Cadence must be between 1 and 8760 hours." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("ai_topics").insert({
    topic,
    angle: angle || null,
    category_id: categoryId,
    cadence_hours: Math.round(cadence),
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/topics");
  return { ok: true };
}

export async function setTopicActive(formData: FormData): Promise<ActionResult> {
  const user = await requireEditor();
  if (!user) return { error: "Editorial role required." };

  const id = String(formData.get("topic_id") ?? "");
  const active = String(formData.get("is_active") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase.from("ai_topics").update({ is_active: active }).eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/topics");
  return { ok: true };
}

export async function deleteTopic(formData: FormData): Promise<ActionResult> {
  const user = await requireEditor();
  if (!user) return { error: "Editorial role required." };

  const id = String(formData.get("topic_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("ai_topics").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/topics");
  return { ok: true };
}

/**
 * The kill switch, and the limits around it.
 *
 * Stored in the database rather than an environment variable so it can be
 * thrown from the dashboard in seconds. A switch that needs a redeploy to flip
 * is not usable in the moment you actually need it.
 */
export async function setAutonomousSetting(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const key = String(formData.get("key") ?? "");
  const rawValue = String(formData.get("value") ?? "");

  const allowed = [
    "autonomous_publishing_enabled",
    "autonomous_daily_limit",
    "autonomous_publish_delay_minutes",
  ];
  if (!allowed.includes(key)) return { error: "Unknown setting." };

  let value: unknown;
  if (key === "autonomous_publishing_enabled") {
    value = rawValue === "true";
  } else {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric < 0) return { error: "Enter a number." };
    if (key === "autonomous_daily_limit" && numeric > 100) {
      return { error: "The daily limit is capped at 100. Publishing more than that unreviewed is not something this dashboard will set up for you." };
    }
    if (key === "autonomous_publish_delay_minutes" && numeric > 1440) {
      return { error: "The delay cannot exceed 24 hours." };
    }
    value = Math.round(numeric);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("site_settings")
    .update({ value: value as never, updated_by: admin.id })
    .eq("key", key);

  if (error) return { error: error.message };

  revalidatePath("/admin/topics");
  return { ok: true };
}

/** Runs a generation cycle immediately, rather than waiting for the schedule. */
export async function runGenerationNow(): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  try {
    const report = await runAutonomousGeneration();

    if (!report.enabled) {
      return { ok: true, note: "Autonomous publishing is switched off. Nothing was written." };
    }

    const published = report.outcomes.filter((o) => o.status === "published");
    const failed = report.outcomes.filter((o) => o.status === "failed");
    const claims = report.outcomes.reduce((sum, o) => sum + (o.unverifiedClaimCount ?? 0), 0);

    revalidatePath("/admin/topics");
    revalidatePath("/");

    return {
      ok: true,
      note: [
        `${published.length} published`,
        failed.length ? `${failed.length} failed (${failed[0].reason})` : "",
        published.length ? `${claims} unverified claims across them` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Run failed." };
  }
}
