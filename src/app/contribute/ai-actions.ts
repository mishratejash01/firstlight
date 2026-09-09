"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser, isEditorial } from "@/lib/auth/roles";
import { slugify, withUniqueSuffix } from "@/lib/format/slug";
import { DRAFTING_MODEL } from "@/lib/ai/config";
import {
  draftArticle,
  suggestHeadlines,
  suggestTags,
  summariseForQueue,
} from "@/lib/ai/draft";
import type { DraftedArticle } from "@/lib/ai/schemas";

/**
 * AI assist actions.
 *
 * Every one writes a DRAFT. None sets a published state, and none could: the
 * articles RLS policy refuses a contributor any transition into 'published',
 * and these actions run as the signed-in user rather than with the service key.
 * The human-publish rule is a database property here, not a promise made in
 * this file.
 */

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function requireWriter() {
  const user = await getSessionUser();
  if (!user) return null;
  if (!isEditorial(user) && !user.roles.includes("author")) return null;
  return user;
}

/**
 * Generates a complete draft from a topic and files it in the queue.
 *
 * Tags, entities, key facts and FAQs are written alongside the body, so the
 * editor is reviewing a finished shape rather than a wall of prose they then
 * have to structure themselves.
 */
export async function generateDraft(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireWriter();
  if (!user) return { ok: false, error: "You do not have permission to draft articles." };

  const topic = String(formData.get("topic") ?? "").trim();
  const angle = String(formData.get("angle") ?? "").trim();
  const sourceMaterial = String(formData.get("source_material") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "");

  if (!topic) return { ok: false, error: "Describe what the article should be about." };
  if (!categoryId) return { ok: false, error: "Choose a section." };

  const supabase = await createClient();

  const { data: category } = await supabase
    .from("categories")
    .select("name")
    .eq("id", categoryId)
    .maybeSingle();

  const result = await draftArticle({
    topic,
    angle: angle || undefined,
    sourceMaterial: sourceMaterial || undefined,
    sectionName: category?.name,
  });

  if (!result.ok) return { ok: false, error: result.error };
  const draft = result.data;

  const base = slugify(draft.headline) || "untitled";
  const { data: clash } = await supabase
    .from("articles")
    .select("slug")
    .eq("slug", base)
    .maybeSingle();

  const { data: authorRow } = await supabase
    .from("authors")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: article, error } = await supabase
    .from("articles")
    .insert({
      headline: draft.headline,
      slug: clash ? withUniqueSuffix(base) : base,
      standfirst: draft.standfirst,
      summary: draft.summary,
      body: draft.bodyMarkdown,
      category_id: categoryId,
      created_by: user.id,
      author_id: authorRow?.id ?? null,
      status: "draft",
      origin: "original",
      ai_assisted: true,
      ai_model: DRAFTING_MODEL,
      ai_generated_at: new Date().toISOString(),
      ai_unverified_claims: draft.unverifiedClaims,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  // Structured extras are best-effort. A failure to attach a tag is not a
  // reason to throw away a drafted article the writer is waiting on.
  await attachStructuredData(article.id, draft);

  revalidatePath("/contribute");
  return { ok: true, data: { id: article.id } };
}

async function attachStructuredData(articleId: string, draft: DraftedArticle) {
  const supabase = await createClient();

  try {
    for (const name of draft.suggestedTags.slice(0, 8)) {
      const slug = slugify(name);
      if (!slug) continue;

      const { data: tag } = await supabase
        .from("tags")
        .upsert({ slug, name }, { onConflict: "slug" })
        .select("id")
        .single();

      if (tag) {
        await supabase
          .from("article_tags")
          .insert({ article_id: articleId, tag_id: tag.id, ai_suggested: true });
      }
    }

    for (const entity of draft.entities.slice(0, 10)) {
      const slug = slugify(entity.name);
      if (!slug) continue;

      const { data: row } = await supabase
        .from("entities")
        .upsert(
          { slug, name: entity.name, entity_type: entity.type },
          { onConflict: "slug" },
        )
        .select("id")
        .single();

      if (row) {
        await supabase.from("article_entities").insert({
          article_id: articleId,
          entity_id: row.id,
          relation: entity.relation,
          role_note: entity.roleNote,
          ai_suggested: true,
        });
      }
    }

    if (draft.keyFacts.length) {
      await supabase.from("article_key_facts").insert(
        draft.keyFacts.slice(0, 8).map((fact, index) => ({
          article_id: articleId,
          label: fact.label,
          value: fact.value,
          attribution: fact.attribution,
          position: index,
        })),
      );
    }

    if (draft.faqs.length) {
      await supabase.from("article_faqs").insert(
        draft.faqs.slice(0, 8).map((faq, index) => ({
          article_id: articleId,
          question: faq.question,
          answer: faq.answer,
          position: index,
        })),
      );
    }
  } catch (error) {
    console.error("[ai] draft saved but structured data partially failed", error);
  }
}

export async function requestTagSuggestions(
  formData: FormData,
): Promise<ActionResult<string[]>> {
  const user = await requireWriter();
  if (!user) return { ok: false, error: "Not permitted." };

  const headline = String(formData.get("headline") ?? "");
  const body = String(formData.get("body") ?? "");
  if (!body.trim()) return { ok: false, error: "Write something first." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("tags").select("name").limit(80);

  const result = await suggestTags({
    headline,
    body,
    existingTags: (existing ?? []).map((t) => t.name),
  });

  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
}

export async function requestHeadlines(
  formData: FormData,
): Promise<ActionResult<string[]>> {
  const user = await requireWriter();
  if (!user) return { ok: false, error: "Not permitted." };

  const headline = String(formData.get("headline") ?? "");
  const body = String(formData.get("body") ?? "");
  if (!body.trim()) return { ok: false, error: "Write something first." };

  const result = await suggestHeadlines({ headline, body });
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
}

export async function requestSummary(
  formData: FormData,
): Promise<ActionResult<{ summary: string; standfirst: string }>> {
  const user = await requireWriter();
  if (!user) return { ok: false, error: "Not permitted." };

  const headline = String(formData.get("headline") ?? "");
  const body = String(formData.get("body") ?? "");
  if (!body.trim()) return { ok: false, error: "Write something first." };

  const result = await summariseForQueue({ headline, body });
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
}
