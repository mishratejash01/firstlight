"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser, isEditorial } from "@/lib/auth/roles";

/**
 * Review submissions.
 *
 * Both go through the caller's own session, so Row Level Security decides:
 * the row's reviewer must be the caller, the caller must hold the reviewer
 * role or an editorial one, and one person reviews a story once. The label
 * the engine learns from is written by a database trigger on insert, so a
 * review cannot exist without its label or the other way round.
 */

type ActionResult = { error: string } | { ok: true; note?: string };

const TIMINGS = ["early", "on_time", "late", "stale"] as const;
const ISSUES = [
  "wrong_facts",
  "missing_context",
  "wrong_picture",
  "wrong_section",
  "duplicate",
  "weak_headline",
  "not_news",
  "reads_like_pr",
  "poor_writing",
  "too_short",
  "too_long",
] as const;

async function requireReviewerUser() {
  const user = await getSessionUser();
  if (!user) return null;
  if (!user.roles.includes("reviewer") && !isEditorial(user)) return null;
  return user;
}

function scale(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export async function submitArticleReview(formData: FormData): Promise<ActionResult> {
  const user = await requireReviewerUser();
  if (!user) return { error: "Reviewer role required." };

  const articleId = String(formData.get("article_id") ?? "");
  const eventId = String(formData.get("event_id") ?? "") || null;
  const importance = scale(formData.get("importance"));
  const quality = scale(formData.get("quality"));
  const timing = String(formData.get("timing") ?? "");
  const issues = formData.getAll("issues").map(String).filter((i) => (ISSUES as readonly string[]).includes(i));
  const betterSection = String(formData.get("better_section_id") ?? "") || null;
  const wouldNotRun = String(formData.get("would_not_run") ?? "") === "true";
  const seconds = Number(formData.get("seconds_spent"));
  const device = String(formData.get("device") ?? "").slice(0, 40) || null;

  if (!articleId) return { error: "No story given." };
  if (importance === null) return { error: "Rate the importance, 1 to 5." };
  if (quality === null) return { error: "Rate the quality, 1 to 5." };
  if (!(TIMINGS as readonly string[]).includes(timing)) return { error: "Say whether we were early, on time, late or stale." };

  const supabase = await createClient();
  const { error } = await supabase.from("article_reviews").insert({
    article_id: articleId,
    event_id: eventId,
    reviewer_id: user.id,
    importance,
    timing,
    quality,
    issues,
    better_section_id: betterSection,
    would_not_run: wouldNotRun,
    seconds_spent: Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : null,
    device,
  });

  if (error) {
    return { error: error.code === "23505" ? "You have already reviewed this story." : error.message };
  }

  revalidatePath("/review");
  return { ok: true };
}

export async function submitMissedReview(formData: FormData): Promise<ActionResult> {
  const user = await requireReviewerUser();
  if (!user) return { error: "Reviewer role required." };

  const eventId = String(formData.get("event_id") ?? "");
  const verdict = String(formData.get("should_have_written") ?? "");
  const importance = scale(formData.get("importance"));
  const seconds = Number(formData.get("seconds_spent"));

  if (!eventId) return { error: "No story given." };
  if (verdict !== "yes" && verdict !== "no") return { error: "Say yes or no." };
  if (verdict === "yes" && importance === null) return { error: "If we should have written it, how important was it, 1 to 5?" };

  const supabase = await createClient();
  const { error } = await supabase.from("event_reviews").insert({
    event_id: eventId,
    reviewer_id: user.id,
    should_have_written: verdict === "yes",
    importance: verdict === "yes" ? importance : null,
    seconds_spent: Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : null,
  });

  if (error) {
    return { error: error.code === "23505" ? "You have already answered this one." : error.message };
  }

  revalidatePath("/review/missed");
  return { ok: true };
}
