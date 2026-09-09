"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser, isEditorial } from "@/lib/auth/roles";
import { submitToIndexNow } from "@/lib/seo/indexnow";

/**
 * Editor desk actions.
 *
 * Each one runs as the signed-in editor through the request-scoped client, so
 * RLS is the enforcement layer. The isEditorial() checks below are there to
 * return a clear message instead of a bare permission error — they are not what
 * stops a contributor publishing themselves. That is the articles update
 * policy, and it holds even if every line of this file were deleted.
 */

type ActionResult = { error: string } | { ok: true; note?: string };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

async function guard() {
  const user = await getSessionUser();
  if (!user || !isEditorial(user)) return null;
  return user;
}

export async function publishArticle(formData: FormData): Promise<ActionResult> {
  const user = await guard();
  if (!user) return { error: "Editorial role required." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing article." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articles")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq("id", id)
    .select("slug, categories ( slug )")
    .single();

  if (error) return { error: error.message };

  // Push the new URL to IndexNow. Breaking search demand peaks within hours, so
  // waiting for the next crawl misses the window entirely. A failed ping is
  // reported, never fatal — the story is already live either way.
  let note: string | undefined;
  if (SITE_URL && data?.categories) {
    const url = `${SITE_URL}/${(data.categories as unknown as { slug: string }).slug}/${data.slug}`;
    const result = await submitToIndexNow([url]);
    if (!result.ok) note = `Published. Search engines were not notified: ${result.reason}`;
  }

  revalidatePath("/desk");
  revalidatePath("/");
  return { ok: true, note };
}

/**
 * Schedules a story.
 *
 * published_at is what actually gates public visibility, so setting it in the
 * future is the schedule — there is no worker that must later run and could
 * fail. The 'scheduled' status is the label the desk sees.
 */
export async function scheduleArticle(formData: FormData): Promise<ActionResult> {
  const user = await guard();
  if (!user) return { error: "Editorial role required." };

  const id = String(formData.get("id") ?? "");
  const when = String(formData.get("scheduled_for") ?? "");
  if (!id || !when) return { error: "Choose a publication time." };

  const timestamp = new Date(when);
  if (Number.isNaN(timestamp.getTime())) return { error: "That is not a valid time." };
  if (timestamp.getTime() <= Date.now()) {
    return { error: "Scheduled time must be in the future. To publish now, use Publish." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("articles")
    .update({
      status: "scheduled",
      published_at: timestamp.toISOString(),
      scheduled_for: timestamp.toISOString(),
      reviewed_by: user.id,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/desk");
  return { ok: true };
}

/** Sends a piece back to its author, who may then edit and resubmit. */
export async function sendBackToAuthor(formData: FormData): Promise<ActionResult> {
  const user = await guard();
  if (!user) return { error: "Editorial role required." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing article." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("articles")
    .update({ status: "rejected", reviewed_by: user.id })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/desk");
  return { ok: true };
}

/** Takes a published story off the public site without destroying it. */
export async function archiveArticle(formData: FormData): Promise<ActionResult> {
  const user = await guard();
  if (!user) return { error: "Editorial role required." };

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("articles").update({ status: "archived" }).eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/desk");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Pins a story to the front page.
 *
 * Every pin carries an expiry. A hero pinned at 6am and forgotten is still the
 * splash at midnight otherwise, which is how a front page goes stale while
 * everyone assumes the algorithm is handling it.
 */
export async function pinToHomepage(formData: FormData): Promise<ActionResult> {
  const user = await guard();
  if (!user) return { error: "Editorial role required." };

  const articleId = String(formData.get("article_id") ?? "");
  const zone = String(formData.get("zone") ?? "hero");
  const hours = Number(formData.get("hours") ?? 12);

  if (!articleId) return { error: "Missing article." };
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
    return { error: "Pin duration must be between 1 and 168 hours." };
  }

  const supabase = await createClient();
  const expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();

  // One article per slot: clear the slot first so pinning is idempotent rather
  // than failing on the unique index.
  const position = zone === "hero" ? 1 : Number(formData.get("position") ?? 1);
  await supabase.from("homepage_placements").delete().eq("zone", zone).eq("position", position);

  const { error } = await supabase.from("homepage_placements").insert({
    zone,
    position,
    article_id: articleId,
    pinned_by: user.id,
    expires_at: expiresAt,
  });

  if (error) return { error: error.message };

  revalidatePath("/desk");
  revalidatePath("/");
  return { ok: true };
}

export async function unpinFromHomepage(formData: FormData): Promise<ActionResult> {
  const user = await guard();
  if (!user) return { error: "Editorial role required." };

  const id = String(formData.get("placement_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("homepage_placements").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/desk");
  revalidatePath("/");
  return { ok: true };
}
