import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Everything an article page needs, in one place.
 *
 * The related-article ranking is not here: it lives in the related_articles
 * Postgres function, which is the only thing able to see the private trending
 * rollup.
 */

export type ArticleDetail = {
  id: string;
  slug: string;
  headline: string;
  standfirst: string | null;
  body: string | null;
  summary: string | null;
  origin: "wire" | "original" | "curated";
  attribution_url: string | null;
  attribution_label: string | null;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  hero_image_credit: string | null;
  published_at: string | null;
  updated_at: string;
  /** When the headline, standfirst, body or summary last changed. */
  content_updated_at: string | null;
  is_breaking: boolean;
  ai_assisted: boolean;
  ai_unverified_claims: string[] | null;
  reviewed_by: string | null;
  meta_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  /** The searches the story was written to answer, most important first. */
  search_keywords: string[] | null;
  categories: { slug: string; name: string };
  authors: {
    slug: string;
    display_name: string;
    title: string | null;
    bio: string | null;
  } | null;
};

/**
 * Wrapped in React's cache so generateMetadata and the page share one fetch
 * per request instead of each making the round trips to the database.
 */
export const getArticle = cache(async function getArticle(
  categorySlug: string,
  slug: string,
) {
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select(
      `
      id, slug, headline, standfirst, body, summary, origin,
      attribution_url, attribution_label,
      hero_image_url, hero_image_alt, hero_image_credit,
      published_at, updated_at, content_updated_at, is_breaking,
      ai_assisted, ai_unverified_claims, reviewed_by,
      meta_title, meta_description, canonical_url, search_keywords,
      categories!inner ( slug, name ),
      authors ( slug, display_name, title, bio )
    `,
    )
    .eq("slug", slug)
    .eq("categories.slug", categorySlug)
    .in("status", ["published", "scheduled"])
    .lte("published_at", new Date().toISOString())
    .maybeSingle();

  if (!article) return null;
  const detail = article as unknown as ArticleDetail;

  // Fired together: none of these depends on another, and an article page that
  // waits for four sequential round trips to Sydney is a slow article page.
  const [tags, entities, keyFacts, faqs, eventLinks] = await Promise.all([
    supabase
      .from("article_tags")
      .select("tags ( slug, name )")
      .eq("article_id", detail.id),
    supabase
      .from("article_entities")
      .select("relation, role_note, entities ( slug, name, entity_type, same_as )")
      .eq("article_id", detail.id),
    supabase
      .from("article_key_facts")
      .select("label, value, attribution")
      .eq("article_id", detail.id)
      .order("position", { ascending: true }),
    supabase
      .from("article_faqs")
      .select("question, answer")
      .eq("article_id", detail.id)
      .order("position", { ascending: true }),
    supabase
      .from("article_events")
      .select("relation, news_events ( slug, title, is_live )")
      .eq("article_id", detail.id),
  ]);

  return {
    article: detail,
    tags: (tags.data ?? [])
      .map((row) => row.tags as unknown as { slug: string; name: string } | null)
      .filter((t): t is { slug: string; name: string } => Boolean(t)),
    entities: (entities.data ?? []).map((row) => ({
      relation: row.relation as "about" | "mentions",
      roleNote: row.role_note as string | null,
      entity: row.entities as unknown as {
        slug: string;
        name: string;
        entity_type: string;
        same_as: string[];
      },
    })),
    keyFacts: (keyFacts.data ?? []) as {
      label: string;
      value: string;
      attribution: string;
    }[],
    faqs: (faqs.data ?? []) as { question: string; answer: string }[],
    events: (eventLinks.data ?? [])
      .map((row) => row.news_events as unknown as {
        slug: string;
        title: string;
        is_live: boolean;
      } | null)
      .filter((e): e is { slug: string; title: string; is_live: boolean } => Boolean(e)),
  };
});

/** Ranked related coverage, from the recommendation function. */
export async function getRelatedArticles(articleId: string, limit = 4) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("related_articles", {
    p_article_id: articleId,
    p_limit: limit,
  });

  if (error) return [];
  return data ?? [];
}
