import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { slugify } from "@/lib/format/slug";
import type { Database } from "@/lib/supabase/database.types";
import type { DraftedArticle } from "./schemas";

/**
 * Saves the structured data that comes back with a generated draft.
 *
 * This existed in two of the three writing paths and was missing from the
 * third, so every article the trends pipeline produced arrived with no tags, no
 * entities and no key facts. That is quieter than it sounds: the article looks
 * fine, but the schema.org entity markup is empty, the key-numbers block does
 * not render, tag pages never list it, and the recommendation engine — which
 * ranks on shared tags — cannot relate it to anything.
 *
 * One implementation, called by all three, so the next writing path cannot
 * forget.
 */

type Client = SupabaseClient<Database>;

export type AttachResult = {
  tags: number;
  entities: number;
  keyFacts: number;
  faqs: number;
  searchKeywords: number;
};

/**
 * The drafter's search phrases, tidied: lower case, single-spaced, each once,
 * none absurdly long, at most eight.
 */
function cleanKeywords(phrases: string[] | undefined): string[] {
  const kept: string[] = [];
  for (const phrase of phrases ?? []) {
    const clean = phrase.toLowerCase().replace(/\s+/g, " ").trim();
    if (clean && clean.length <= 80 && !kept.includes(clean)) kept.push(clean);
    if (kept.length === 8) break;
  }
  return kept;
}

export async function attachStructuredData(
  supabase: Client,
  articleId: string,
  draft: DraftedArticle,
): Promise<AttachResult> {
  const result: AttachResult = { tags: 0, entities: 0, keyFacts: 0, faqs: 0, searchKeywords: 0 };

  // Best effort throughout. A tag that fails to attach is not a reason to lose
  // an article that has already been written and paid for.
  try {
    for (const name of draft.suggestedTags.slice(0, 8)) {
      const slug = slugify(name);
      if (!slug) continue;

      const { data: tag } = await supabase
        .from("tags")
        .upsert({ slug, name }, { onConflict: "slug" })
        .select("id")
        .single();

      if (!tag) continue;

      const { error } = await supabase
        .from("article_tags")
        .insert({ article_id: articleId, tag_id: tag.id, ai_suggested: true });
      if (!error) result.tags += 1;
    }
  } catch (error) {
    console.error("[structure] tags failed", error);
  }

  try {
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

      if (!row) continue;

      const { error } = await supabase.from("article_entities").insert({
        article_id: articleId,
        entity_id: row.id,
        relation: entity.relation,
        role_note: entity.roleNote,
        ai_suggested: true,
      });
      if (!error) result.entities += 1;
    }
  } catch (error) {
    console.error("[structure] entities failed", error);
  }

  try {
    if (draft.keyFacts.length) {
      const { error } = await supabase.from("article_key_facts").insert(
        draft.keyFacts.slice(0, 8).map((fact, index) => ({
          article_id: articleId,
          label: fact.label,
          value: fact.value,
          attribution: fact.attribution,
          position: index,
        })),
      );
      if (!error) result.keyFacts = Math.min(draft.keyFacts.length, 8);
    }
  } catch (error) {
    console.error("[structure] key facts failed", error);
  }

  try {
    if (draft.faqs.length) {
      const { error } = await supabase.from("article_faqs").insert(
        draft.faqs.slice(0, 8).map((faq, index) => ({
          article_id: articleId,
          question: faq.question,
          answer: faq.answer,
          position: index,
        })),
      );
      if (!error) result.faqs = Math.min(draft.faqs.length, 8);
    }
  } catch (error) {
    console.error("[structure] faqs failed", error);
  }

  // The searches the piece was written to answer, kept with it so an editor
  // can see them and they can be checked later against the searches that
  // actually bring readers. Replaced, not merged, when a story is redrafted.
  try {
    const keywords = cleanKeywords(draft.searchKeywords);
    if (keywords.length) {
      const { error } = await supabase
        .from("articles")
        .update({ search_keywords: keywords })
        .eq("id", articleId);
      if (!error) result.searchKeywords = keywords.length;
    }
  } catch (error) {
    console.error("[structure] search keywords failed", error);
  }

  return result;
}
