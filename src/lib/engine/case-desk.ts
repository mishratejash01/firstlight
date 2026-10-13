import "server-only";

import { attachStructuredData } from "@/lib/ai/attach-structure";
import {
  draftCaseStudy,
  proposeCaseQuestions,
  qualifyCaseCandidates,
  readCaseStudy,
  refreshCaseStudy,
  type CaseCandidateInput,
  type CaseStudyBlock,
  type CaseStudyDocument,
  type CaseSubject,
  type CaseVerdict,
} from "@/lib/ai/case-study";
import { draftingModelId } from "@/lib/ai/config";
import { revalidateStory } from "@/lib/cache/revalidate-story";
import { getSourceDocuments } from "@/lib/fetch/extract";
import { isGoogleNewsRedirect, resolveGoogleNewsUrl } from "@/lib/fetch/google-redirect";
import { slugify, withUniqueSuffix } from "@/lib/format/slug";
import { illustrateArticle } from "@/lib/media/illustrate";
import { submitToIndexNow } from "@/lib/seo/indexnow";
import { researchSearch } from "@/lib/seo/search-research";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchGoogleNews, type NewsHit } from "@/lib/trends/google-news";

/**
 * The case desk.
 *
 * Every two hours it looks at the last three days of news and the trend
 * feeds, asks the gate (lib/ai/case-study) which of them have a question
 * behind them worth a case study, and writes at most one. A candidate that an
 * existing case study already answers refreshes that page instead. When
 * nothing in the news qualifies, it writes one from the question bank, at
 * most once a week, and tops the bank up when it runs low. Everything it
 * considered, and why it decided as it did, is written to case_candidates
 * for the administrator to read.
 *
 * Case studies are articles of format 'case_study' under the Case studies
 * section, with the structured block the template renders in `case_study`.
 */

export const CASE_SECTION_SLUG = "case-studies";
const NOT_SUBJECTS = new Set([CASE_SECTION_SLUG, "opinion"]);
const HOT_WINDOW_HOURS = 72;
const TREND_WINDOW_HOURS = 48;
const CONSIDERED_WINDOW_DAYS = 7;
const MAX_CANDIDATES = 8;
const MAX_DOCUMENTS = 8;
const DOCUMENT_CHARS = 7000;
const BANK_LOW_WATER = 6;
const BANK_TOP_UP = 12;
/** Writing takes this long at most; a pass with less time left does not start one. */
const WRITE_BUDGET_MS = 150_000;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export type CaseDeskReport = {
  enabled: boolean;
  cap: number;
  writtenToday: number;
  considered: number;
  verdicts: { title: string; question: string; verdict: string; viral: number | null }[];
  wrote: { slug: string; status: string; kind: string } | null;
  updated: { slug: string } | null;
  proposed: number;
  skipped?: string;
};

type Supabase = ReturnType<typeof createAdminClient>;

type Candidate = {
  kind: "hot";
  eventId: string | null;
  trendId: string | null;
  title: string;
  summary: string | null;
  section: string | null;
  sourceCount: number | null;
  score: number | null;
  trendTraffic: string | null;
  firstSeenAt: string | null;
  /** The paper's own story on it, if one was written. */
  articleHref: string | null;
  sourceUrls: string[];
};

type Existing = { id: string; slug: string; headline: string; reviewedAt: string | null; caseStudy: unknown };

async function readSetting<T>(supabase: Supabase, key: string, fallback: T): Promise<T> {
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

export async function loadSubjects(supabase: Supabase): Promise<CaseSubject[]> {
  const { data } = await supabase.from("categories").select("slug, name").eq("is_active", true).order("sort_order");
  return (data ?? []).filter((c) => !NOT_SUBJECTS.has(c.slug));
}

async function loadExisting(supabase: Supabase): Promise<Existing[]> {
  const { data } = await supabase
    .from("articles")
    .select("id, slug, headline, reviewed_at, case_study")
    .eq("format", "case_study")
    .in("status", ["published", "scheduled"])
    .order("published_at", { ascending: false })
    .limit(300);
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    headline: row.headline,
    reviewedAt: row.reviewed_at,
    caseStudy: row.case_study,
  }));
}

async function writtenInLastDay(supabase: Supabase): Promise<number> {
  const { count } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("format", "case_study")
    .neq("status", "draft")
    .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  return count ?? 0;
}

/** The day's candidates: strong story events and trending searches not considered in the last week. */
async function gatherHot(supabase: Supabase): Promise<Candidate[]> {
  const since = new Date(Date.now() - CONSIDERED_WINDOW_DAYS * 86400_000).toISOString();
  const { data: seen } = await supabase
    .from("case_candidates")
    .select("story_event_id, trend_id")
    .gte("created_at", since);
  const seenEvents = new Set((seen ?? []).map((row) => row.story_event_id).filter(Boolean));
  const seenTrends = new Set((seen ?? []).map((row) => row.trend_id).filter(Boolean));

  const { data: events } = await supabase
    .from("story_events")
    .select("id, title, summary, score, source_count, first_seen_at, triage_section, article_id")
    .in("status", ["written", "newsworthy", "writing"])
    .gte("first_seen_at", new Date(Date.now() - HOT_WINDOW_HOURS * 3600_000).toISOString())
    .order("score", { ascending: false })
    .limit(40);

  const articleIds = (events ?? []).map((e) => e.article_id).filter((id): id is string => Boolean(id));
  const { data: articles } = articleIds.length
    ? await supabase.from("articles").select("id, slug, categories ( slug )").in("id", articleIds)
    : { data: [] as { id: string; slug: string; categories: unknown }[] };
  const articleById = new Map(
    (articles ?? []).map((a) => [a.id, { slug: a.slug, section: (a.categories as { slug: string } | null)?.slug ?? null }]),
  );

  const candidates: Candidate[] = [];
  for (const event of events ?? []) {
    if (seenEvents.has(event.id)) continue;
    const article = event.article_id ? articleById.get(event.article_id) : undefined;
    const section = article?.section ?? event.triage_section ?? null;
    if (section && NOT_SUBJECTS.has(section)) continue;
    candidates.push({
      kind: "hot",
      eventId: event.id,
      trendId: null,
      title: event.title,
      summary: event.summary,
      section,
      sourceCount: event.source_count,
      score: event.score,
      trendTraffic: null,
      firstSeenAt: event.first_seen_at,
      articleHref: article && section ? `/${section}/${article.slug}` : null,
      sourceUrls: [],
    });
    if (candidates.length >= MAX_CANDIDATES - 2) break;
  }

  const { data: trends } = await supabase
    .from("trending_topics")
    .select("id, term, news_items, approx_traffic, demand_score, first_seen_at, triage_category")
    .gte("last_seen_at", new Date(Date.now() - TREND_WINDOW_HOURS * 3600_000).toISOString())
    .not("status", "in", "(rejected,skipped,failed)")
    .order("demand_score", { ascending: false })
    .limit(20);
  for (const trend of trends ?? []) {
    if (seenTrends.has(trend.id)) continue;
    const items = Array.isArray(trend.news_items) ? (trend.news_items as { title?: string; url?: string; source?: string }[]) : [];
    candidates.push({
      kind: "hot",
      eventId: null,
      trendId: trend.id,
      title: trend.term,
      summary: items
        .slice(0, 3)
        .map((item) => item.title)
        .filter(Boolean)
        .join(" · ") || null,
      section: trend.triage_category,
      sourceCount: items.length || null,
      score: trend.demand_score,
      trendTraffic: trend.approx_traffic,
      firstSeenAt: trend.first_seen_at,
      articleHref: null,
      sourceUrls: items.map((item) => item.url).filter((url): url is string => Boolean(url)).slice(0, 3),
    });
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  return candidates;
}

/** Reads coverage for a question: the news search, plus any links the trigger carried. */
async function readCoverage(
  queries: string[],
  extraUrls: string[],
): Promise<{ documents: CaseStudyDocument[]; coverage: { title: string; source: string; url: string }[]; headlines: string[] }> {
  const hits: NewsHit[] = [];
  for (const query of queries.slice(0, 3)) {
    try {
      for (const hit of await searchGoogleNews(query)) {
        if (!hits.some((h) => h.url === hit.url)) hits.push(hit);
      }
    } catch {
      // A search that fails leaves the others.
    }
  }
  const targets: { url: string; source: string; title: string }[] = [
    ...extraUrls.map((url) => ({ url, source: hostOf(url), title: "" })),
    ...hits.map((hit) => ({ url: hit.url, source: hit.source, title: hit.title })),
  ].slice(0, MAX_DOCUMENTS);
  for (const target of targets) {
    if (isGoogleNewsRedirect(target.url)) target.url = await resolveGoogleNewsUrl(target.url);
  }
  const fetched = targets.length ? await getSourceDocuments(targets.map((t) => t.url)) : [];
  const documents: CaseStudyDocument[] = fetched
    .filter((doc) => doc.status === "ok" && doc.content)
    .map((doc) => ({
      url: doc.url,
      source: targets.find((t) => t.url === doc.url)?.source ?? doc.host,
      title: doc.title,
      content: (doc.content as string).slice(0, DOCUMENT_CHARS),
    }));
  const coverage = targets.map((target) => ({
    title: target.title || fetched.find((doc) => doc.url === target.url)?.title || target.url,
    source: target.source,
    url: target.url,
  }));
  return { documents, coverage, headlines: hits.map((hit) => hit.title) };
}

export type WriteInput = {
  question: string;
  subject: CaseSubject;
  angle: string;
  searchQueries: string[];
  trigger: { title: string; summary: string | null; href: string | null; sourceUrls: string[] } | null;
  kind: "hot" | "canon" | "admin";
};

export type WriteOutcome =
  | { ok: true; id: string; slug: string; status: string }
  | { ok: false; reason: string };

/** Writes one case study and files it under the section. */
export async function writeCaseStudy(supabase: Supabase, input: WriteInput): Promise<WriteOutcome> {
  const { data: section } = await supabase.from("categories").select("id, slug, name").eq("slug", CASE_SECTION_SLUG).maybeSingle();
  if (!section) return { ok: false, reason: "The Case studies section is missing." };

  const { documents, coverage, headlines } = await readCoverage(
    [...input.searchQueries, input.question],
    input.trigger?.sourceUrls ?? [],
  );
  const research = await researchSearch({ title: input.question, headlines });

  const result = await draftCaseStudy({
    question: input.question,
    subject: input.subject,
    angle: input.angle,
    trigger: input.trigger ? { title: input.trigger.title, summary: input.trigger.summary } : null,
    documents,
    coverage,
    searchResearch: research,
  });
  if (!result.ok) return { ok: false, reason: result.error };
  const draft = result.data;

  const lastProse = draft.bodyMarkdown.trim().split(/\n{2,}/).at(-1) ?? "";
  if (!/[.!?"'\)\]]$/.test(lastProse.trim())) return { ok: false, reason: "Draft ended mid-sentence and was discarded." };
  if (draft.mechanism.steps.length < 3) return { ok: false, reason: "Draft had no mechanism to speak of and was discarded." };
  const headline = draft.headline.trim().replace(/[.?!]*$/, "") + "?";

  const illustration = await illustrateArticle({
    headline,
    section: input.subject.name,
    subjects: draft.entities.filter((e) => e.relation === "about").map((e) => ({ name: e.name, type: e.type })),
    related: draft.entities.filter((e) => e.relation !== "about").map((e) => ({ name: e.name, type: e.type })),
    brief: draft.imageBrief,
    terms: draft.imageSearchTerms,
  });

  const delayMinutes = await readSetting<number>(supabase, "autonomous_publish_delay_minutes", 0);
  const now = Date.now();
  const status = delayMinutes > 0 ? "scheduled" : "published";
  const publishedAt = new Date(now + Math.max(delayMinutes, 0) * 60_000).toISOString();

  const base = slugify(headline.replace(/\?$/, "")) || "case-study";
  const { data: clash } = await supabase.from("articles").select("slug").eq("slug", base).maybeSingle();

  const block: CaseStudyBlock = {
    shortAnswer: draft.shortAnswer,
    atAGlance: draft.atAGlance.slice(0, 8),
    now: draft.now,
    mechanism: draft.mechanism,
    affects: draft.affects,
    responses: draft.responses.slice(0, 8),
    whatYouCanDo: draft.whatYouCanDo.slice(0, 8),
    openQuestions: draft.openQuestions.slice(0, 6),
    sources: draft.sources.slice(0, 12),
    updates: [],
    trigger: input.trigger ? { title: input.trigger.title, href: input.trigger.href } : null,
  };

  const { data: article, error } = await supabase
    .from("articles")
    .insert({
      headline,
      slug: clash ? withUniqueSuffix(base) : base,
      standfirst: draft.standfirst,
      summary: draft.summary,
      body: draft.bodyMarkdown,
      category_id: section.id,
      format: "case_study",
      subject_slug: input.subject.slug,
      case_study: block,
      reviewed_at: new Date(now).toISOString(),
      origin: "original",
      status,
      published_at: publishedAt,
      is_breaking: false,
      ai_assisted: true,
      ai_model: draftingModelId(),
      ai_generated_at: new Date(now).toISOString(),
      ai_unverified_claims: draft.unverifiedClaims,
      hero_image_url: illustration?.url ?? null,
      hero_image_alt: illustration?.alt ?? null,
      hero_image_credit: illustration?.credit ?? null,
      image_brief: draft.imageBrief,
      image_terms: draft.imageSearchTerms,
    })
    .select("id, slug")
    .single();
  if (error) return { ok: false, reason: error.message };

  await attachStructuredData(supabase, article.id, {
    headline,
    headlineAlternatives: [],
    standfirst: draft.standfirst,
    summary: draft.summary,
    bodyMarkdown: draft.bodyMarkdown,
    suggestedTags: draft.suggestedTags,
    searchKeywords: draft.searchKeywords,
    imageBrief: draft.imageBrief,
    imageSearchTerms: draft.imageSearchTerms,
    keyFacts: draft.atAGlance,
    entities: draft.entities,
    faqs: draft.faqs,
    unverifiedClaims: draft.unverifiedClaims,
  });

  if (status === "published") {
    revalidateStory(CASE_SECTION_SLUG, article.slug);
    if (SITE_URL) await submitToIndexNow([`${SITE_URL}/${CASE_SECTION_SLUG}/${article.slug}`]);
  }
  return { ok: true, id: article.id, slug: article.slug, status };
}

/** Brings an existing case study up to date with the news that matched it. */
async function updateExisting(
  supabase: Supabase,
  existing: Existing,
  trigger: { title: string; summary: string | null; href: string | null; sourceUrls: string[] },
): Promise<WriteOutcome> {
  const block = readCaseStudy(existing.caseStudy);
  if (!block) return { ok: false, reason: "The stored case study could not be read." };
  const { documents } = await readCoverage([trigger.title], trigger.sourceUrls);
  const result = await refreshCaseStudy({ headline: existing.headline, block, trigger, documents });
  if (!result.ok) return { ok: false, reason: result.error };
  const fresh = result.data;
  const nowIso = new Date().toISOString();
  const atAGlance = [...block.atAGlance];
  for (const change of fresh.atAGlanceChanges) {
    const index = atAGlance.findIndex((f) => f.label.toLowerCase() === change.label.toLowerCase());
    if (index >= 0) atAGlance[index] = change;
    else atAGlance.push(change);
  }
  const updated: CaseStudyBlock = {
    ...block,
    now: fresh.now,
    shortAnswer: fresh.shortAnswer || block.shortAnswer,
    atAGlance: atAGlance.slice(0, 8),
    updates: [...block.updates, { at: nowIso, note: fresh.updateNote, href: trigger.href }].slice(-12),
  };
  const { error } = await supabase
    .from("articles")
    .update({ case_study: updated, reviewed_at: nowIso, content_updated_at: nowIso })
    .eq("id", existing.id);
  if (error) return { ok: false, reason: error.message };
  revalidateStory(CASE_SECTION_SLUG, existing.slug);
  if (SITE_URL) await submitToIndexNow([`${SITE_URL}/${CASE_SECTION_SLUG}/${existing.slug}`]);
  return { ok: true, id: existing.id, slug: existing.slug, status: "updated" };
}

function allChecksPass(verdict: CaseVerdict): boolean {
  const c = verdict.checks;
  return [c.questionBehind, c.askedNow, c.enoughMaterial, c.lasting, c.safe, c.travels].every((check) => check.yes) && verdict.question.trim().length > 0;
}

/** Tops the question bank up when it runs low. Returns how many were added. */
export async function topUpQuestionBank(supabase: Supabase, subjects: CaseSubject[], force = false): Promise<number> {
  const { count } = await supabase.from("case_questions").select("id", { count: "exact", head: true }).in("status", ["open", "queued"]);
  if (!force && (count ?? 0) >= BANK_LOW_WATER) return 0;
  const { data: asked } = await supabase.from("case_questions").select("question").order("created_at", { ascending: false }).limit(200);
  const result = await proposeCaseQuestions({ subjects, existing: (asked ?? []).map((q) => q.question), count: BANK_TOP_UP });
  if (!result.ok) return 0;
  const valid = new Set(subjects.map((s) => s.slug));
  const seen = new Set((asked ?? []).map((q) => q.question.trim().toLowerCase()));
  let added = 0;
  for (const q of result.data) {
    const question = q.question.trim();
    const key = question.toLowerCase();
    if (!valid.has(q.subject) || question.length <= 10 || seen.has(key)) continue;
    seen.add(key);
    // One at a time: the bank is unique on the question regardless of case,
    // and one clash must not lose the rest.
    const { error } = await supabase.from("case_questions").insert({
      subject_slug: q.subject,
      question,
      rationale: q.rationale,
      demand_score: Math.max(0, Math.min(10, q.demandScore)),
      proposed_by: "engine",
    });
    if (!error) added += 1;
  }
  return added;
}

/** One pass of the case desk. */
export async function runCaseDesk({ deadline }: { deadline: number }): Promise<CaseDeskReport> {
  const supabase = createAdminClient();
  const enabled = await readSetting<boolean>(supabase, "case_studies_enabled", true);
  const cap = await readSetting<number>(supabase, "case_studies_daily_cap", 3);
  const canonDays = await readSetting<number>(supabase, "case_studies_canon_days", 7);
  const writtenToday = await writtenInLastDay(supabase);
  const report: CaseDeskReport = { enabled, cap, writtenToday, considered: 0, verdicts: [], wrote: null, updated: null, proposed: 0 };
  if (!enabled) return { ...report, skipped: "case_studies_enabled is off" };

  const subjects = await loadSubjects(supabase);
  const existing = await loadExisting(supabase);
  const subjectBySlug = new Map(subjects.map((s) => [s.slug, s]));

  // The news: what the gate says of it.
  const candidates = await gatherHot(supabase);
  report.considered = candidates.length;
  let best: { candidate: Candidate; verdict: CaseVerdict } | null = null;
  let refresh: { candidate: Candidate; verdict: CaseVerdict; existing: Existing } | null = null;
  if (candidates.length) {
    const inputs: CaseCandidateInput[] = candidates.map((c, index) => ({
      index: index + 1,
      kind: c.kind,
      title: c.title,
      summary: c.summary,
      section: c.section,
      sourceCount: c.sourceCount,
      score: c.score,
      trendTraffic: c.trendTraffic,
      firstSeenAt: c.firstSeenAt,
    }));
    const gate = await qualifyCaseCandidates({
      candidates: inputs,
      subjects,
      existing: existing.map((e) => ({ slug: e.slug, headline: e.headline, reviewedAt: e.reviewedAt })),
    });
    const verdicts = gate.ok ? gate.data : [];
    for (const [index, candidate] of candidates.entries()) {
      const verdict = verdicts.find((v) => v.index === index + 1);
      const duplicate = verdict?.duplicateOf ? existing.find((e) => e.slug === verdict.duplicateOf) : undefined;
      let outcome: "rejected" | "deferred" = "rejected";
      let reason = gate.ok ? "" : gate.error;
      if (verdict && duplicate) {
        reason = `Already answered by ${duplicate.slug}`;
        if (verdict.worthUpdating && !refresh) refresh = { candidate, verdict, existing: duplicate };
      } else if (verdict && allChecksPass(verdict) && subjectBySlug.has(verdict.subject)) {
        outcome = "deferred";
        if (!best || verdict.viralScore > best.verdict.viralScore) best = { candidate, verdict };
      } else if (verdict) {
        reason = Object.entries(verdict.checks)
          .filter(([, check]) => !check.yes)
          .map(([name, check]) => `${name}: ${check.note}`)
          .join(" | ") || "A check failed.";
      }
      report.verdicts.push({ title: candidate.title, question: verdict?.question ?? "", verdict: duplicate ? "duplicate" : outcome, viral: verdict?.viralScore ?? null });
      await supabase.from("case_candidates").insert({
        kind: "hot",
        story_event_id: candidate.eventId,
        trend_id: candidate.trendId,
        title: candidate.title,
        question: verdict?.question || null,
        subject_slug: verdict?.subject || null,
        verdict: outcome,
        reasons: verdict ? { checks: verdict.checks, angle: verdict.angle, duplicateOf: verdict.duplicateOf, reason } : { reason },
        viral_score: verdict?.viralScore ?? null,
      });
    }
  }

  const timeLeft = () => deadline - Date.now();

  if (best && writtenToday < cap && timeLeft() > WRITE_BUDGET_MS) {
    const { candidate, verdict } = best;
    const outcome = await writeCaseStudy(supabase, {
      question: verdict.question,
      subject: subjectBySlug.get(verdict.subject)!,
      angle: verdict.angle,
      searchQueries: verdict.searchQueries,
      trigger: { title: candidate.title, summary: candidate.summary, href: candidate.articleHref, sourceUrls: candidate.sourceUrls },
      kind: "hot",
    });
    await supabase
      .from("case_candidates")
      .update(outcome.ok ? { verdict: "written", article_id: outcome.id } : { verdict: "failed", error: outcome.reason })
      .eq("kind", "hot")
      .eq("title", candidate.title)
      .gte("created_at", new Date(Date.now() - 600_000).toISOString());
    if (outcome.ok) {
      report.wrote = { slug: outcome.slug, status: outcome.status, kind: "hot" };
      report.writtenToday += 1;
    } else {
      report.skipped = outcome.reason;
    }
  } else if (refresh && timeLeft() > WRITE_BUDGET_MS) {
    const { candidate, existing: page } = refresh;
    const outcome = await updateExisting(supabase, page, {
      title: candidate.title,
      summary: candidate.summary,
      href: candidate.articleHref,
      sourceUrls: candidate.sourceUrls,
    });
    await supabase
      .from("case_candidates")
      .update(outcome.ok ? { verdict: "updated", article_id: page.id } : { verdict: "failed", error: outcome.reason })
      .eq("kind", "hot")
      .eq("title", candidate.title)
      .gte("created_at", new Date(Date.now() - 600_000).toISOString());
    if (outcome.ok) report.updated = { slug: page.slug };
  }

  // Nothing hot was written: the canon, at most once in canonDays, and the
  // bank topped up first if it is running low.
  if (!report.wrote && writtenToday < cap && timeLeft() > WRITE_BUDGET_MS) {
    report.proposed = await topUpQuestionBank(supabase, subjects);
    const { data: lastCanon } = await supabase
      .from("case_questions")
      .select("written_at")
      .eq("status", "written")
      .eq("proposed_by", "engine")
      .order("written_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const dueAt = lastCanon?.written_at ? Date.parse(lastCanon.written_at) + canonDays * 86400_000 : 0;
    const { data: queued } = await supabase
      .from("case_questions")
      .select("id, question, subject_slug, rationale, proposed_by")
      .eq("status", "queued")
      .order("updated_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const pick =
      queued ??
      (Date.now() >= dueAt
        ? (
            await supabase
              .from("case_questions")
              .select("id, question, subject_slug, rationale, proposed_by")
              .eq("status", "open")
              .order("demand_score", { ascending: false })
              .limit(1)
              .maybeSingle()
          ).data
        : null);
    if (pick && subjectBySlug.has(pick.subject_slug) && timeLeft() > WRITE_BUDGET_MS) {
      const kind = pick.proposed_by === "admin" ? "admin" : "canon";
      const outcome = await writeCaseStudy(supabase, {
        question: pick.question,
        subject: subjectBySlug.get(pick.subject_slug)!,
        angle: pick.rationale ?? "",
        searchQueries: [pick.question],
        trigger: null,
        kind,
      });
      await supabase.from("case_candidates").insert({
        kind,
        question_id: pick.id,
        title: pick.question,
        question: pick.question,
        subject_slug: pick.subject_slug,
        verdict: outcome.ok ? "written" : "failed",
        reasons: { from: "question bank" },
        article_id: outcome.ok ? outcome.id : null,
        error: outcome.ok ? null : outcome.reason,
      });
      if (outcome.ok) {
        await supabase.from("case_questions").update({ status: "written", article_id: outcome.id, written_at: new Date().toISOString() }).eq("id", pick.id);
        report.wrote = { slug: outcome.slug, status: outcome.status, kind };
        report.writtenToday += 1;
      } else {
        report.skipped = outcome.reason;
      }
    }
  }

  return report;
}
