"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/roles";
import { fitSelectionWeights, rollbackSelectionWeights } from "@/lib/engine/fit";
import { fitEarlinessModel, scoreEarliness } from "@/lib/engine/earliness";

/**
 * The Learning page's controls.
 *
 * Everything here is reversible and recorded: a fit writes a model version
 * whether or not it is promoted, a rollback is itself a new promoted version,
 * and the switch is one row in site_settings.
 */

type ActionResult = { error: string } | { ok: true; note?: string };

async function requireAdminUser() {
  const user = await getSessionUser();
  if (!user || !user.roles.includes("admin")) return null;
  return user;
}

export async function setLearningEnabled(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const enabled = String(formData.get("enabled") ?? "") === "true";
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_settings")
    .update({ value: enabled as never, updated_by: admin.id })
    .eq("key", "engine_learning_enabled");
  if (error) return { error: error.message };

  revalidatePath("/admin/learning");
  return {
    ok: true,
    note: enabled
      ? "On. The nightly fit may promote new weights when they beat the live ones."
      : "Off. Fits still run and are recorded, but the live weights hold still.",
  };
}

export async function runFitNow(): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  try {
    const selection = await fitSelectionWeights();
    const earliness = await fitEarlinessModel();
    const rescored = await scoreEarliness();
    revalidatePath("/admin/learning");
    const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${Math.round(v * 100)}%`);
    return {
      ok: true,
      note: [
        `Selection: ${selection.status}`,
        selection.fitted ? `(fitted AUC ${pct(selection.fitted.auc)} vs live ${pct(selection.live?.auc)})` : "",
        `on ${selection.examples} examples.`,
        `Earliness: ${earliness.status}`,
        earliness.auc != null ? `(AUC ${pct(earliness.auc)})` : "",
        `on ${earliness.train} events; ${rescored.scored} live events rescored.`,
      ]
        .filter(Boolean)
        .join(" "),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The fit failed." };
  }
}

export async function rollbackWeights(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const versionId = Number(formData.get("version_id"));
  if (!Number.isInteger(versionId)) return { error: "No version given." };
  const result = await rollbackSelectionWeights(versionId);
  if ("error" in result) return result;

  revalidatePath("/admin/learning");
  return { ok: true, note: `Weights restored from version ${versionId}.` };
}

export async function harvestNow(): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const supabase = createAdminClient();
  const [four, day, sample] = await Promise.all([
    supabase.rpc("engine_harvest_outlet_outcomes", { p_hours: 4 }),
    supabase.rpc("engine_harvest_outlet_outcomes", { p_hours: 24 }),
    supabase.rpc("engine_build_missed_sample", {}),
  ]);
  const problem = four.error ?? day.error ?? sample.error;
  if (problem) return { error: problem.message };

  revalidatePath("/admin/learning");
  revalidatePath("/review/missed");
  return {
    ok: true,
    note: `${four.data ?? 0} four-hour and ${day.data ?? 0} day labels harvested; ${sample.data ?? 0} stories added to yesterday's missed sample.`,
  };
}
