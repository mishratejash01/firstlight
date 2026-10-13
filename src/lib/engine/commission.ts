import "server-only";

import { revalidatePath } from "next/cache";

import { attachStructuredData } from "@/lib/ai/attach-structure";
import { draftingModelId } from "@/lib/ai/config";
import { draftCommission } from "@/lib/ai/draft";
import { commissionBriefSchema, type CommissionBrief, type CommissionImage } from "@/lib/ai/steer";
import { revalidateStory } from "@/lib/cache/revalidate-story";
import { getSourceDocuments } from "@/lib/fetch/extract";
import { isGoogleNewsRedirect, resolveGoogleNewsUrl } from "@/lib/fetch/google-redirect";
import { slugify, withUniqueSuffix } from "@/lib/format/slug";
import { illustrateArticle } from "@/lib/media/illustrate";
import { submitToIndexNow } from "@/lib/seo/indexnow";
import { researchSearch } from "@/lib/seo/search-research";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchGoogleNews, type NewsHit } from "@/lib/trends/google-news";
import { linkPictureDecision } from "@/lib/media/picture-desk";

/**
 * Writes the stories an administrator commissioned.
 *
 * A commission is a brief settled in the Steer dialogue (lib/ai/steer): what
 * the story is, its line, the facts the editor supplied, links to read,
 * whether to search for coverage, which of the editor's pictures go where,
 * and when to publish. The desk writes it ahead of everything else on its
 * next pass, from that brief and whatever coverage could be read, and
 * publishes it exactly as the brief says — now, after the usual delay, or
 * not at all until an editor does.
 *
 * The editor's standing instructions do not apply here. A commission is a
 * direct order about one story, and it outranks a general one about what
 * to cover.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

/** Reclaim a commission whose writer went quiet. */
const STALE_CLAIM_MINUTES = 10;
const MAX_ATTEMPTS = 3;
/** Source pages read at most, counting the editor's links and the search together. */
const MAX_DOCUMENTS = 6;

export type CommissionOutcome = {
  id: string;
  status: "done" | "failed" | "skipped";
  slug?: string;
  /** What the article was filed as: published, scheduled or draft. */
  articleStatus?: string;
  sourcesRead?: number;
  reason?: string;
};

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** The pictures as stored, dropping anything that is not a usable record. */
function readImages(raw: unknown): CommissionImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .filter((item) => typeof item.url === "string" && item.url.startsWith("https://"))
    .map((item) => ({
      url: item.url as string,
      publicId: typeof item.publicId === "string" ? item.publicId : "",
      width: typeof item.width === "number" ? item.width : null,
      height: typeof item.height === "number" ? item.height : null,
      alt: typeof item.alt === "string" ? item.alt : "",
      caption: typeof item.caption === "string" ? item.caption : "",
      credit: typeof item.credit === "string" ? item.credit : "",
    }));
}

/** A picture as a Markdown figure the story renderer understands: alt, URL, and a caption that carries the credit. */
function figure(image: CommissionImage, caption: string, credit: string): string {
  const alt = (image.alt || caption || "Picture").replace(/[[\]]/g, "").trim();
  const text = [caption.trim().replace(/\.+$/, ""), credit.trim()].filter(Boolean).join(". ");
  return text ? `![${alt}](${image.url} "${text.replace(/"/g, "'")}")` : `![${alt}](${image.url})`;
}

/**
 * Puts the editor's pictures into the body: where the writer marked
 * [[IMAGE-n]], and otherwise after the second paragraph and every third one
 * after that, so a picture the writer forgot is still used.
 */
function placeImages(
  body: string,
  images: { index: number; image: CommissionImage; caption: string; credit: string }[],
): string {
  const placed = new Set<number>();
  let text = body.trim().replace(/^[ \t]*\[\[\s*IMAGE-(\d+)\s*\]\][ \t]*$/gim, (_, n: string) => {
    const index = Number(n);
    const entry = images.find((i) => i.index === index);
    if (!entry || placed.has(index)) return "";
    placed.add(index);
    return figure(entry.image, entry.caption, entry.credit);
  });
  text = text.replace(/\[\[\s*IMAGE-\d+\s*\]\]/gi, "");

  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  let at = 2;
  for (const entry of images) {
    if (placed.has(entry.index)) continue;
    blocks.splice(Math.min(at, blocks.length), 0, figure(entry.image, entry.caption, entry.credit));
    at += 3;
  }
  return blocks.join("\n\n");
}

/** Writes every queued commission, oldest first, up to `limit`. */
export async function writeCommissions(limit = 1): Promise<CommissionOutcome[]> {
  const supabase = createAdminClient();
  const stale = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString();
  const { data } = await supabase
    .from("commissioned_posts")
    .select("id")
    .or(`status.eq.queued,and(status.eq.writing,claimed_at.lt.${stale})`)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(limit);

  const outcomes: CommissionOutcome[] = [];
  for (const row of data ?? []) outcomes.push(await writeCommission(row.id));
  return outcomes;
}

/** Writes one commission, if it is queued or its last writer went quiet. */
export async function writeCommission(id: string): Promise<CommissionOutcome> {
  const supabase = createAdminClient();
  const stale = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString();

  const { data: current } = await supabase
    .from("commissioned_posts")
    .select("attempts")
    .eq("id", id)
    .maybeSingle();
  if (!current) return { id, status: "skipped", reason: "No such commission." };
  const attempts = current.attempts + 1;

  // The claim: one UPDATE whose WHERE repeats the availability test, so two
  // overlapping runs cannot both write it.
  const { data: claimed } = await supabase
    .from("commissioned_posts")
    .update({ status: "writing", claimed_at: new Date().toISOString(), attempts })
    .eq("id", id)
    .or(`status.eq.queued,and(status.eq.writing,claimed_at.lt.${stale})`)
    .select("id, prompt, images, brief, created_by");
  const post = claimed?.[0];
  if (!post) return { id, status: "skipped", reason: "Not queued, or another run is writing it." };

  const fail = async (reason: string): Promise<CommissionOutcome> => {
    const gaveUp = attempts >= MAX_ATTEMPTS;
    await supabase
      .from("commissioned_posts")
      .update({ status: gaveUp ? "failed" : "queued", last_error: reason })
      .eq("id", id);
    return { id, status: "failed", reason: gaveUp ? `Gave up after ${attempts} attempts: ${reason}` : reason };
  };

  try {
    const parsed = commissionBriefSchema.safeParse(post.brief);
    if (!parsed.success) return fail("The brief could not be read. Discard this and commission it again.");
    const brief: CommissionBrief = parsed.data;
    const images = readImages(post.images);

    // What to read: the editor's links first, then what a news search finds.
    const targets: { url: string; source: string; title: string }[] = brief.sources
      .map((url) => url.trim())
      .filter((url) => /^https?:\/\//i.test(url))
      .slice(0, MAX_DOCUMENTS)
      .map((url) => ({ url, source: hostOf(url), title: "" }));

    let hits: NewsHit[] = [];
    if (brief.research && brief.searchQuery.trim()) {
      try {
        hits = (await searchGoogleNews(brief.searchQuery.trim())).slice(0, MAX_DOCUMENTS);
      } catch {
        hits = [];
      }
      for (const hit of hits) {
        if (targets.length >= MAX_DOCUMENTS) break;
        targets.push({ url: hit.url, source: hit.source, title: hit.title });
      }
    }
    for (const target of targets) {
      if (isGoogleNewsRedirect(target.url)) target.url = await resolveGoogleNewsUrl(target.url);
    }
    const fetched = targets.length ? await getSourceDocuments(targets.map((t) => t.url)) : [];
    const documents = fetched
      .filter((doc) => doc.status === "ok" && doc.content)
      .map((doc) => ({
        url: doc.url,
        source: targets.find((t) => t.url === doc.url)?.source ?? doc.host,
        title: doc.title,
        byline: doc.byline,
        content: doc.content as string,
      }));
    const newsItems = targets.map((target) => ({
      title: target.title || fetched.find((doc) => doc.url === target.url)?.title || target.url,
      source: target.source,
      url: target.url,
    }));

    const research = await researchSearch({
      title: brief.headlineHint || brief.searchQuery || post.prompt.slice(0, 120),
      headlines: hits.map((hit) => hit.title),
    });

    const heroIndex = brief.heroImageIndex >= 1 && brief.heroImageIndex <= images.length ? brief.heroImageIndex : 0;
    const placements = brief.imagePlacements.filter((p) => p.index >= 1 && p.index <= images.length);
    const captionFor = (index: number) => placements.find((p) => p.index === index);
    // Pictures for the body: the ones the brief places, or every picture but
    // the main one when the brief left placement to the writer.
    const bodyImages = images
      .map((image, i) => ({ index: i + 1, image }))
      .filter(({ index }) => index !== heroIndex && (!placements.length || placements.some((p) => p.index === index)))
      .map(({ index, image }) => ({
        index,
        image,
        caption: captionFor(index)?.caption || image.caption,
        credit: captionFor(index)?.credit || image.credit || "Special arrangement",
      }));

    const { data: categories } = await supabase.from("categories").select("id, name, slug").eq("is_active", true);
    const section =
      (categories ?? []).find((c) => c.name.toLowerCase() === brief.section.trim().toLowerCase()) ?? null;

    const result = await draftCommission({
      prompt: post.prompt,
      brief,
      images: [
        ...(heroIndex ? [{ index: heroIndex, alt: images[heroIndex - 1].alt, caption: "", isHero: true }] : []),
        ...bodyImages.map((b) => ({ index: b.index, alt: b.image.alt, caption: b.caption, isHero: false })),
      ].sort((a, b) => a.index - b.index),
      newsItems,
      documents,
      searchResearch: research,
      sectionName: section?.name,
    });
    if (!result.ok) return fail(result.error);
    const draft = result.data;

    const body = placeImages(draft.bodyMarkdown, bodyImages);
    const lastProse = body
      .split(/\n{2,}/)
      .filter((block) => !block.startsWith("!["))
      .at(-1);
    if (!lastProse || !/[.!?"'\)\]]$/.test(lastProse.trim())) return fail("Draft ended mid-sentence and was discarded.");

    const chosenSection =
      section ??
      (categories ?? []).find((c) => c.name.toLowerCase() === (draft.suggestedTags[0] ?? "").toLowerCase()) ??
      (categories ?? [])[0];
    if (!chosenSection) return fail("No sections configured.");

    // The main picture: the editor's, or a licensed one the illustrator finds.
    let hero: { url: string; alt: string; credit: string } | null = null;
    let illustration: Awaited<ReturnType<typeof illustrateArticle>> = null;
    if (heroIndex) {
      const image = images[heroIndex - 1];
      hero = {
        url: image.url,
        alt: image.alt || draft.headline,
        credit: captionFor(heroIndex)?.credit || image.credit || "Special arrangement",
      };
    } else {
      illustration = await illustrateArticle({
        headline: draft.headline,
        section: chosenSection.name,
        subjects: draft.entities.filter((e) => e.relation === "about").map((e) => ({ name: e.name, type: e.type })),
        related: draft.entities.filter((e) => e.relation !== "about").map((e) => ({ name: e.name, type: e.type })),
        standfirst: draft.standfirst,
        brief: draft.imageBrief,
        alternatives: draft.imageAlternatives,
        terms: draft.imageSearchTerms,
      });
      hero = illustration ? { url: illustration.url, alt: illustration.alt, credit: illustration.credit } : null;
    }

    const delayMinutes = await readSetting<number>("autonomous_publish_delay_minutes", 0);
    const now = Date.now();
    let status: "published" | "scheduled" | "draft";
    let publishedAt: string | null;
    if (brief.publish === "draft") {
      status = "draft";
      publishedAt = null;
    } else if (brief.publish === "now" || delayMinutes <= 0) {
      status = "published";
      publishedAt = new Date(now).toISOString();
    } else {
      status = "scheduled";
      publishedAt = new Date(now + delayMinutes * 60_000).toISOString();
    }

    const base = slugify(draft.headline) || slugify(post.prompt.slice(0, 60)) || "story";
    const { data: clash } = await supabase.from("articles").select("slug").eq("slug", base).maybeSingle();

    const { data: article, error } = await supabase
      .from("articles")
      .insert({
        headline: draft.headline,
        slug: clash ? withUniqueSuffix(base) : base,
        standfirst: draft.standfirst,
        summary: draft.summary,
        body,
        category_id: chosenSection.id,
        origin: "original",
        status,
        published_at: publishedAt,
        is_breaking: brief.breaking && status !== "draft",
        ai_assisted: true,
        ai_model: draftingModelId(),
        ai_generated_at: new Date(now).toISOString(),
        ai_unverified_claims: draft.unverifiedClaims,
        hero_image_url: hero?.url ?? null,
        hero_image_alt: hero?.alt ?? null,
        hero_image_credit: hero?.credit ?? null,
        image_brief: draft.imageBrief,
        image_terms: draft.imageSearchTerms,
        created_by: post.created_by,
      })
      .select("id, slug")
      .single();
    if (error) return fail(error.message);

    await attachStructuredData(supabase, article.id, draft);
    if (!heroIndex) await linkPictureDecision(illustration?.decisionId, article.id);
    await supabase
      .from("commissioned_posts")
      .update({ status: "done", article_id: article.id, last_error: null })
      .eq("id", id);

    // Live this moment: rebuild its pages and tell search engines. A scheduled
    // story is announced by announceNewlyLive when its time comes.
    if (status === "published") {
      revalidateStory(chosenSection.slug, article.slug);
      if (brief.breaking) revalidatePath("/breaking");
      if (SITE_URL) await submitToIndexNow([`${SITE_URL}/${chosenSection.slug}/${article.slug}`]);
    }

    return { id, status: "done", slug: article.slug, articleStatus: status, sourcesRead: documents.length };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Writing failed.");
  }
}
