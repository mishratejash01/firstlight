"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/auth/roles";
import { loadSubjects, topUpQuestionBank } from "@/lib/engine/case-desk";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * The administrator's hand on the case desk: questions added, queued, dropped
 * or reopened in the bank the desk writes from, and the bank topped up on
 * request. Writing itself stays with the desk's own pass (lib/engine/case-desk):
 * a queued question goes first on its next run, within two hours.
 */

type ActionResult = { error: string } | { ok: true; note?: string };

/** A form action returns nothing; what happened is logged and the page re-read. */
function asForm(run: (formData: FormData) => Promise<ActionResult>): (formData: FormData) => Promise<void> {
  return async (formData) => {
    const result = await run(formData);
    if ("error" in result) console.error("[case-studies]", result.error);
  };
}

async function requireAdminUser() {
  const user = await getSessionUser();
  if (!user || !user.roles.includes("admin")) return null;
  return user;
}

async function addQuestion(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };
  const question = String(formData.get("question") ?? "").trim().replace(/[.?!]*$/, "") + "?";
  const subject = String(formData.get("subject") ?? "").trim();
  const rationale = String(formData.get("rationale") ?? "").trim();
  if (question.length < 12) return { error: "Write the question in full." };
  const supabase = await createClient();
  const { error } = await supabase.from("case_questions").insert({
    question,
    subject_slug: subject,
    rationale: rationale || null,
    status: "queued",
    proposed_by: "admin",
    demand_score: 10,
  });
  if (error) return { error: error.message.includes("case_questions_question_key") ? "That question is already in the bank." : error.message };
  revalidatePath("/admin/case-studies");
  return { ok: true, note: "Queued: the desk writes it on its next pass." };
}

async function setStatus(formData: FormData, status: "queued" | "dropped" | "open"): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("case_questions").update({ status }).eq("id", id).neq("status", "written");
  if (error) return { error: error.message };
  revalidatePath("/admin/case-studies");
  return { ok: true };
}

export const queueCaseQuestion = asForm((formData) => setStatus(formData, "queued"));

export const dropCaseQuestion = asForm((formData) => setStatus(formData, "dropped"));

export const reopenCaseQuestion = asForm((formData) => setStatus(formData, "open"));

/** Asks the engine for more questions, whatever the bank holds. One model call. */
async function proposeMore(): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };
  const supabase = createAdminClient();
  const subjects = await loadSubjects(supabase);
  const added = await topUpQuestionBank(supabase, subjects, true);
  revalidatePath("/admin/case-studies");
  return { ok: true, note: `${added} question${added === 1 ? "" : "s"} added.` };
}

export const addCaseQuestion = asForm(addQuestion);
export const proposeMoreQuestions = asForm(() => proposeMore());
