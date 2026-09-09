"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/roles";
import { slugify, withUniqueSuffix } from "@/lib/format/slug";

/**
 * Contributor actions.
 *
 * Every write here goes through the request-scoped client, so it runs as the
 * signed-in user and is subject to RLS. None of these functions checks whether
 * the caller may publish, because none of them can publish: the articles update
 * policy refuses any transition into a published state from a contributor,
 * whatever this code asks for.
 */

type ActionResult = { error: string } | { ok: true };

async function uniqueSlug(headline: string): Promise<string> {
  const supabase = await createClient();
  const base = slugify(headline) || "untitled";

  const { data } = await supabase.from("articles").select("slug").eq("slug", base).maybeSingle();
  return data ? withUniqueSuffix(base) : base;
}

export async function createDraft(formData: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { error: "You are not signed in." };

  const headline = String(formData.get("headline") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "");

  if (!headline) return { error: "A headline is required." };
  if (!categoryId) return { error: "Choose a section." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articles")
    .insert({
      headline,
      slug: await uniqueSlug(headline),
      category_id: categoryId,
      created_by: user.id,
      status: "draft",
      origin: "original",
      author_id: (
        await supabase.from("authors").select("id").eq("user_id", user.id).maybeSingle()
      ).data?.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/contribute");
  redirect(`/contribute/${data.id}`);
}

export async function saveDraft(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing article." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("articles")
    .update({
      headline: String(formData.get("headline") ?? "").trim(),
      standfirst: String(formData.get("standfirst") ?? "").trim() || null,
      body: String(formData.get("body") ?? "").trim() || null,
      summary: String(formData.get("summary") ?? "").trim() || null,
      category_id: String(formData.get("category_id") ?? "") || undefined,
      hero_image_url: String(formData.get("hero_image_url") ?? "").trim() || null,
      hero_image_alt: String(formData.get("hero_image_alt") ?? "").trim() || null,
      hero_image_credit: String(formData.get("hero_image_credit") ?? "").trim() || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/contribute/${id}`);
  revalidatePath("/contribute");
  return { ok: true };
}

/**
 * Hands a draft to the desk.
 *
 * 'in_review' is as far as a contributor can move a story. The next transition
 * is an editor's to make.
 */
export async function submitForReview(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing article." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("articles")
    .update({ status: "in_review" })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/contribute");
  revalidatePath("/desk");
  return { ok: true };
}
