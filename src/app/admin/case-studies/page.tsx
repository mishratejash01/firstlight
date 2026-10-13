import Link from "next/link";
import type { Metadata } from "next";

import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { requireAdmin } from "@/lib/auth/guards";
import { formatDateTime, formatTimeAgo } from "@/lib/format/datetime";
import { getAllSections } from "@/lib/queries/navigation";
import { createClient } from "@/lib/supabase/server";

import { addCaseQuestion, dropCaseQuestion, proposeMoreQuestions, queueCaseQuestion, reopenCaseQuestion } from "../case-actions";

export const metadata: Metadata = {
  title: "Case studies — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const VERDICT: Record<string, string> = {
  written: "Written",
  updated: "Updated an existing one",
  rejected: "No",
  deferred: "Yes, but another was written first",
  failed: "Failed",
};

const CHECK_NAMES: Record<string, string> = {
  questionBehind: "a question behind it",
  askedNow: "asked now",
  enoughMaterial: "enough material",
  lasting: "lasting",
  safe: "safe",
  travels: "would travel",
};

type Reasons = {
  checks?: Record<string, { yes: boolean; note: string }>;
  angle?: string;
  duplicateOf?: string;
  reason?: string;
  from?: string;
};

function failedChecks(reasons: unknown): string {
  const r = (reasons ?? {}) as Reasons;
  if (r.reason) return r.reason;
  if (!r.checks) return "";
  return Object.entries(r.checks)
    .filter(([, check]) => !check.yes)
    .map(([name, check]) => `${CHECK_NAMES[name] ?? name}: ${check.note}`)
    .join(" · ");
}

const button = "rounded-control border border-hairline px-3 py-1.5 text-meta text-ink hover:border-accent hover:text-accent";

/**
 * The case desk, seen from the newsroom: what it considered and decided, the
 * questions waiting in the bank, and the case studies written so far. The
 * desk writes on its own schedule; an administrator steers it by queueing
 * questions, not by writing here.
 */
export default async function AdminCaseStudiesPage() {
  const user = await requireAdmin("/admin/case-studies");
  const supabase = await createClient();

  const [{ data: candidates }, { data: questions }, { data: written }, { data: settings }, sections] = await Promise.all([
    supabase
      .from("case_candidates")
      .select("id, created_at, kind, title, question, subject_slug, verdict, reasons, viral_score, error, articles ( slug, headline, categories ( slug ) )")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("case_questions")
      .select("id, question, subject_slug, rationale, demand_score, status, proposed_by, created_at")
      .in("status", ["queued", "open", "dropped"])
      .order("status", { ascending: false })
      .order("demand_score", { ascending: false })
      .limit(60),
    supabase
      .from("articles")
      .select("id, slug, headline, status, published_at, reviewed_at, subject_slug, case_study, categories ( slug )")
      .eq("format", "case_study")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("site_settings").select("key, value").like("key", "case_studies_%"),
    getAllSections(),
  ]);

  const nameOf = new Map(sections.map((s) => [s.slug, s.name]));
  const subjects = sections.filter((s) => s.layout === "standard");
  const setting = (key: string) => settings?.find((s) => s.key === key)?.value;
  const queued = (questions ?? []).filter((q) => q.status === "queued");
  const open = (questions ?? []).filter((q) => q.status === "open");
  const dropped = (questions ?? []).filter((q) => q.status === "dropped");

  return (
    <DashboardShell
      user={user}
      title="Case studies"
      standfirst="The question behind the news, answered in full. The desk decides what deserves one; you can hand it questions."
      actions={
        <Link href="/case-studies" className="text-meta text-accent underline underline-offset-4">
          The section
        </Link>
      }
    >
      <AdminNav current="/admin/case-studies" />

      <p className="pt-6 text-meta text-muted">
        Switched {setting("case_studies_enabled") === false ? "off" : "on"} · at most {String(setting("case_studies_daily_cap") ?? 3)} a day · one from the
        bank every {String(setting("case_studies_canon_days") ?? 7)} days when nothing in the news qualifies. The desk runs every two hours.
      </p>

      <section className="pt-8">
        <h2 className="text-section text-ink">Hand it a question</h2>
        <form action={addCaseQuestion} className="mt-4 grid max-w-measure gap-3">
          <label className="grid gap-1 text-meta text-muted">
            The question, as a reader would ask it
            <input name="question" required minLength={12} placeholder="How does a heart attack happen, and why are younger people getting them?" className="rounded-control border border-hairline px-3 py-2 text-body text-ink" />
          </label>
          <label className="grid gap-1 text-meta text-muted">
            Subject
            <select name="subject" required className="rounded-control border border-hairline px-3 py-2 text-body text-ink">
              {subjects.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-meta text-muted">
            Anything the writer should know (optional)
            <input name="rationale" placeholder="The angle, what to include, what to avoid" className="rounded-control border border-hairline px-3 py-2 text-body text-ink" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="rounded-control border border-accent bg-accent px-3.5 py-1.5 text-meta text-paper hover:opacity-90">
              Queue it
            </button>
            <span className="text-meta text-muted">The desk writes queued questions first, on its next pass.</span>
          </div>
        </form>
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-section text-ink">The question bank ({queued.length + open.length})</h2>
          <form action={proposeMoreQuestions}>
            <button type="submit" className={button}>
              Ask the engine for more
            </button>
          </form>
        </div>
        {queued.length + open.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {[...queued, ...open].map((q) => (
              <li key={q.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-body text-ink">{q.question}</p>
                  <p className="mt-0.5 text-meta text-muted">
                    {q.status === "queued" ? "Queued · " : ""}
                    {nameOf.get(q.subject_slug) ?? q.subject_slug} · demand {Number(q.demand_score).toFixed(0)}/10 · {q.proposed_by === "admin" ? "yours" : "engine"}
                    {q.rationale ? ` · ${q.rationale}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {q.status === "open" ? (
                    <form action={queueCaseQuestion}>
                      <input type="hidden" name="id" value={q.id} />
                      <button type="submit" className={button}>
                        Write next
                      </button>
                    </form>
                  ) : null}
                  <form action={dropCaseQuestion}>
                    <input type="hidden" name="id" value={q.id} />
                    <button type="submit" className={button}>
                      Drop
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="The bank is empty." detail="The desk fills it on its next pass, or ask the engine for more now." />
        )}
        {dropped.length ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-meta text-muted">Dropped ({dropped.length})</summary>
            <ul className="mt-2 divide-y divide-hairline">
              {dropped.map((q) => (
                <li key={q.id} className="flex items-start justify-between gap-3 py-2">
                  <p className="text-meta text-muted">{q.question}</p>
                  <form action={reopenCaseQuestion}>
                    <input type="hidden" name="id" value={q.id} />
                    <button type="submit" className={button}>
                      Reopen
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Written ({written?.length ?? 0})</h2>
        {written?.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {written.map((item) => {
              const section = item.categories as unknown as { slug: string } | null;
              const updates = Array.isArray((item.case_study as { updates?: unknown[] } | null)?.updates)
                ? ((item.case_study as { updates: unknown[] }).updates.length)
                : 0;
              return (
                <li key={item.id} className="py-3">
                  <Link href={section ? `/${section.slug}/${item.slug}` : "#"} className="text-body text-accent underline-offset-4 hover:underline">
                    {item.headline}
                  </Link>
                  <p className="mt-0.5 text-meta text-muted">
                    {item.status} · {nameOf.get(item.subject_slug ?? "") ?? item.subject_slug ?? "no subject"} · {item.published_at ? formatDateTime(item.published_at) : "unpublished"}
                    {item.reviewed_at ? ` · reviewed ${formatTimeAgo(item.reviewed_at)}` : ""}
                    {updates ? ` · ${updates} update${updates === 1 ? "" : "s"}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="Nothing written yet." detail="The desk's first pass is due within two hours of deployment." />
        )}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">What the desk considered ({candidates?.length ?? 0})</h2>
        <p className="mt-1 text-meta text-muted">Every candidate from the last passes, with the checks that failed. Most are meant to fail.</p>
        {candidates?.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {candidates.map((c) => {
              const article = c.articles as unknown as { slug: string; headline: string; categories: { slug: string } | null } | null;
              return (
                <li key={c.id} className="py-3">
                  <p className="text-meta text-muted">
                    {formatTimeAgo(c.created_at)} · {c.kind} · <span className={c.verdict === "written" || c.verdict === "updated" ? "text-ink" : ""}>{VERDICT[c.verdict] ?? c.verdict}</span>
                    {c.viral_score !== null ? ` · would travel ${Number(c.viral_score).toFixed(0)}/10` : ""}
                  </p>
                  <p className="mt-0.5 text-body text-ink">{c.title}</p>
                  {c.question ? <p className="mt-0.5 text-body text-muted">→ {c.question}</p> : null}
                  {article && article.categories ? (
                    <p className="mt-0.5 text-meta">
                      <Link href={`/${article.categories.slug}/${article.slug}`} className="text-accent underline-offset-4 hover:underline">
                        {article.headline}
                      </Link>
                    </p>
                  ) : null}
                  {c.verdict === "rejected" || c.verdict === "failed" ? (
                    <p className="mt-0.5 max-w-measure text-meta text-muted">{c.error ?? failedChecks(c.reasons)}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No pass has run yet." detail="The desk runs every two hours and records what it looked at here." />
        )}
      </section>
    </DashboardShell>
  );
}
