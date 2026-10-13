"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

/**
 * An administrator's verdict on a picture the desk chose: good or bad, with
 * a note. The marks are the record the thresholds and the rubric are tuned
 * against; nothing changes automatically from one mark.
 */
async function mark(formData: FormData, verdict: "good" | "bad"): Promise<void> {
  const user = await getSessionUser();
  if (!user || !user.roles.includes("admin")) return;
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase
    .from("picture_decisions")
    .update({ admin_verdict: verdict, admin_note: note || null })
    .eq("id", id);
  if (error) console.error("[pictures] mark failed", error.message);
  revalidatePath("/admin/pictures");
}

export async function markPictureGood(formData: FormData): Promise<void> {
  return mark(formData, "good");
}

export async function markPictureBad(formData: FormData): Promise<void> {
  return mark(formData, "bad");
}
