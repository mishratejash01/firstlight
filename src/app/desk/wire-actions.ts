"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser, isEditorial } from "@/lib/auth/roles";
import { slugify, withUniqueSuffix } from "@/lib/format/slug";
import { summariseForQueue } from "@/lib/ai/draft";

/**
 * Wire queue actions.
 *
 * Promotion is the only path from staging into `articles`, and it creates the
 * article as a DRAFT. Promoting is "bring this into the newsroom", not
 * "publish it" — the editor still reviews and publishes it like anything else.
 *
 * What gets copied across depends on the licence. When full-text reproduction
 * is not permitted, the body is deliberately left empty and the item becomes a
 * curated piece: our own summary plus a link to the original. The database
 * enforces that independently, so an error here cannot become a copyright
 * breach.
 */

type ActionResult<T = undefined> = { error: string } | { ok: true; data?: T; note?: string };

async function requireEditor() {
  const user = await getSessionUser();
  if (!user || !isEditorial(user)) return null;
  return user;
}

export async function promoteWireItem(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireEditor();
  if (!user) return { error: "Editorial role required." };

  const itemId = String(formData.get("item_id") ?? "");
  const categoryId = String(formData.get("category_id") ?? "");
  if (!itemId) return { error: "Missing item." };

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("wire_items")
    .select(
      "id, title, summary, body, link, published_at, suggested_category_id, source_id, status, sources ( name )",
    )
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return { error: "That item no longer exists." };
  if (item.status !== "pending") return { error: "That item has already been dealt with." };

  const targetCategory = categoryId || item.suggested_category_id;
  if (!targetCategory) {
    return { error: "Choose a section — this feed did not supply one we recognise." };
  }

  // Ask the licence what we are permitted to keep.
  const { data: licence } = await supabase
    .from("source_licences")
    .select("allow_full_text")
    .eq("source_id", item.source_id)
    .maybeSingle();

  const mayReproduce = licence?.allow_full_text === true;
  const sourceName = (item.sources as unknown as { name: string } | null)?.name ?? null;

  const base = slugify(item.title) || "wire-item";
  const { data: clash } = await supabase
    .from("articles")
    .select("slug")
    .eq("slug", base)
    .maybeSingle();

  const { data: article, error } = await supabase
    .from("articles")
    .insert({
      headline: item.title,
      slug: clash ? withUniqueSuffix(base) : base,
      summary: item.summary,
      // Only carried across where the contract permits it. Otherwise the editor
      // writes an original summary and the link does the rest.
      body: mayReproduce ? item.body : null,
      category_id: targetCategory,
      source_id: item.source_id,
      origin: mayReproduce ? "wire" : "curated",
      status: "draft",
      created_by: user.id,
      attribution_url: item.link,
      attribution_label: sourceName,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await supabase
    .from("wire_items")
    .update({
      status: "promoted",
      promoted_article_id: article.id,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  revalidatePath("/desk/wire");
  revalidatePath("/desk");

  return {
    ok: true,
    data: { id: article.id },
    note: mayReproduce
      ? "Promoted as a draft with the full text."
      : "Promoted as a curated item — summary and attribution link only, as the licence requires.",
  };
}

export async function rejectWireItem(formData: FormData): Promise<ActionResult> {
  const user = await requireEditor();
  if (!user) return { error: "Editorial role required." };

  const itemId = String(formData.get("item_id") ?? "");
  const supabase = await createClient();

  const { error } = await supabase
    .from("wire_items")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) return { error: error.message };

  revalidatePath("/desk/wire");
  return { ok: true };
}

/**
 * Writes a short précis of a wire item for the queue.
 *
 * Summarising supplied text is the one AI job here that is genuinely grounded:
 * the model is condensing something in front of it rather than recalling
 * anything, so there is nothing to invent.
 */
export async function summariseWireItem(formData: FormData): Promise<ActionResult> {
  const user = await requireEditor();
  if (!user) return { error: "Editorial role required." };

  const itemId = String(formData.get("item_id") ?? "");
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("wire_items")
    .select("title, summary, body")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return { error: "That item no longer exists." };

  const text = item.body ?? item.summary;
  if (!text) return { error: "This item carries no text to summarise." };

  const result = await summariseForQueue({ headline: item.title, body: text });
  if (!result.ok) return { error: result.error };

  const { error } = await supabase
    .from("wire_items")
    .update({ ai_summary: result.data.summary })
    .eq("id", itemId);

  if (error) return { error: error.message };

  revalidatePath("/desk/wire");
  return { ok: true };
}
