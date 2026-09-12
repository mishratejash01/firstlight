"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/roles";
import { ingestAllWireSources } from "@/lib/wire/ingest";

/**
 * The feed switches.
 *
 * Two kinds. The master switch is one row in site_settings and governs every
 * feed in the expanded wave at once; a feed's own switch is its is_active flag.
 * Both are read by the poller before every run and by the engine before every
 * pulse, so a change takes effect within minutes without a deploy.
 *
 * Neither switch touches anything already published. That is not an
 * implementation detail to be careful about; nothing on this path can reach
 * the articles table.
 */

type ActionResult = { error: string } | { ok: true; note?: string };

async function requireAdminUser() {
  const user = await getSessionUser();
  if (!user || !user.roles.includes("admin")) return null;
  return user;
}

export async function setExpandedFeeds(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const enabled = String(formData.get("enabled") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("site_settings")
    .update({ value: enabled as never, updated_by: admin.id })
    .eq("key", "engine_expanded_feeds_enabled");

  if (error) return { error: error.message };

  revalidatePath("/admin/feeds");
  return {
    ok: true,
    note: enabled
      ? "On. The expanded feeds are polled from the next run, within five minutes."
      : "Off. No expanded feed is polled from the next run, and their items stop entering the engine within a minute.",
  };
}

export async function setFeedSwitch(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const sourceId = String(formData.get("source_id") ?? "");
  const active = String(formData.get("is_active") ?? "") === "true";
  if (!sourceId) return { error: "No feed given." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("sources")
    .update({ is_active: active })
    .eq("id", sourceId);

  if (error) return { error: error.message };

  revalidatePath("/admin/feeds");
  revalidatePath("/admin/sources");
  return { ok: true };
}

/** Polls every switched-on feed now rather than waiting for the schedule. */
export async function runFeedsNow(): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  try {
    const reports = await ingestAllWireSources();
    if (!reports.length) return { ok: true, note: "No feed is switched on." };

    const inserted = reports.reduce((sum, r) => sum + r.inserted, 0);
    const failures = reports.filter((r) => r.error);

    revalidatePath("/admin/feeds");
    revalidatePath("/admin/sources");

    return {
      ok: true,
      note: [
        `${reports.length} feeds checked, ${inserted} new items.`,
        failures.length
          ? `Failed: ${failures.map((f) => `${f.sourceSlug} (${f.error})`).join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Polling failed." };
  }
}
