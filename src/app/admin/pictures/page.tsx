import Link from "next/link";
import type { Metadata } from "next";

import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { requireAdmin } from "@/lib/auth/guards";
import { formatTimeAgo } from "@/lib/format/datetime";
import { createClient } from "@/lib/supabase/server";

import { markPictureBad, markPictureGood } from "../picture-actions";

export const metadata: Metadata = {
  title: "Pictures — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const OUTCOME: Record<string, string> = {
  photo: "Photograph chosen",
  logo: "Mark chosen",
  map: "Map used",
  card: "Card used",
  none: "Nothing",
  unjudged: "Judge unavailable; old ladder used",
};

type Scored = {
  index: number;
  role: string;
  source: string;
  title: string | null;
  thumb: string;
  claim: string;
  relevance?: number;
  misleading?: boolean;
  cliche?: boolean;
  setting?: string;
  quality?: number;
  textHeavy?: boolean;
  synthetic?: boolean;
  note?: string;
};

type Chosen = { role: string; source: string; title: string | null; url: string; thumb: string; claim: string };

const button = "rounded-control border border-hairline px-3 py-1.5 text-meta text-ink hover:border-accent hover:text-accent";

/** The last day's decisions, for the tally; the clock is read here, not in the render. */
function lastDay(supabase: Awaited<ReturnType<typeof createClient>>) {
  const since = new Date(Date.now() - 86400_000).toISOString();
  return supabase.from("picture_decisions").select("outcome, admin_verdict").gte("created_at", since);
}

/**
 * The picture desk, seen from the newsroom: each recent decision with the
 * candidates it was made from, the judge's scores, and a place to mark the
 * outcome good or bad. The marks are what the rubric is tuned against.
 */
export default async function AdminPicturesPage() {
  const user = await requireAdmin("/admin/pictures");
  const supabase = await createClient();

  const [{ data: decisions }, { data: settings }] = await Promise.all([
    supabase
      .from("picture_decisions")
      .select("id, created_at, headline, section, story_kind, outcome, reason, judged_by, candidates, chosen, ms, admin_verdict, admin_note, trace, articles ( slug, headline, categories ( slug ) )")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("site_settings").select("key, value").like("key", "picture_%"),
  ]);
  const setting = (key: string) => settings?.find((s) => s.key === key)?.value;

  const { data: day } = await lastDay(supabase);
  const tally = (day ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.outcome] = (acc[row.outcome] ?? 0) + 1;
    return acc;
  }, {});
  const marks = (day ?? []).reduce<Record<string, number>>((acc, row) => {
    if (row.admin_verdict) acc[row.admin_verdict] = (acc[row.admin_verdict] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <DashboardShell
      user={user}
      title="Pictures"
      standfirst="What the picture desk chose, from what, and why. Mark the ones that are wrong; that is how it gets better."
    >
      <AdminNav current="/admin/pictures" />

      <p className="pt-6 text-meta text-muted">
        Desk {setting("picture_desk_enabled") === false ? "off" : "on"} · a picture needs relevance {String(setting("picture_min_score") ?? 7)} of 10 · up to{" "}
        {String(setting("picture_judge_daily_cap") ?? 500)} judge calls a day. Last 24 hours:{" "}
        {Object.entries(tally)
          .map(([k, v]) => `${v} ${OUTCOME[k]?.toLowerCase() ?? k}`)
          .join(", ") || "nothing yet"}
        {marks.good || marks.bad ? ` · marked ${marks.good ?? 0} good, ${marks.bad ?? 0} bad` : ""}.
      </p>

      <section className="pt-8">
        {decisions?.length ? (
          <ul className="divide-y divide-hairline border-t border-hairline">
            {decisions.map((d) => {
              const article = d.articles as unknown as { slug: string; headline: string; categories: { slug: string } | null } | null;
              const href = article?.categories ? `/${article.categories.slug}/${article.slug}` : null;
              const chosen = d.chosen as Chosen | null;
              const candidates = (Array.isArray(d.candidates) ? d.candidates : []) as Scored[];
              const trace = (d.trace ?? {}) as Record<string, unknown>;
              return (
                <li key={d.id} className="py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-meta text-muted">
                        {formatTimeAgo(d.created_at)} · {d.section ?? "—"} · {d.story_kind ?? "general"} ·{" "}
                        <span className={d.outcome === "photo" || d.outcome === "logo" ? "text-ink" : ""}>{OUTCOME[d.outcome] ?? d.outcome}</span>
                        {d.judged_by ? ` · ${d.judged_by}` : ""}
                        {d.ms ? ` · ${(d.ms / 1000).toFixed(0)} s` : ""}
                        {d.admin_verdict ? ` · you marked it ${d.admin_verdict}` : ""}
                      </p>
                      <p className="mt-1 text-body text-ink">
                        {href ? (
                          <Link href={href} className="text-accent underline-offset-4 hover:underline">
                            {d.headline}
                          </Link>
                        ) : (
                          d.headline
                        )}
                      </p>
                      {d.reason ? <p className="mt-1 max-w-measure text-meta text-muted">{d.reason}</p> : null}
                    </div>
                    <div className="flex shrink-0 items-start gap-3">
                      {chosen ? (
                        // The library's own address: the site's loader is for pages.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={chosen.thumb} alt="" className="h-20 w-32 rounded-media object-cover" />
                      ) : null}
                      <form className="flex flex-col gap-2">
                        <input type="hidden" name="id" value={d.id} />
                        <input name="note" placeholder="Why (optional)" defaultValue={d.admin_note ?? ""} className="rounded-control border border-hairline px-2 py-1 text-meta text-ink" />
                        <div className="flex gap-2">
                          <button formAction={markPictureGood} className={button}>
                            Good
                          </button>
                          <button formAction={markPictureBad} className={`${button} text-signal`}>
                            Bad
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>

                  {candidates.length ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-meta text-accent">
                        {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
                        {typeof trace.gatheredMs === "number" ? ` · gathered in ${(trace.gatheredMs / 1000).toFixed(0)} s` : ""}
                        {typeof trace.judgeMs === "number" ? ` · judged in ${(trace.judgeMs / 1000).toFixed(0)} s` : ""}
                      </summary>
                      <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {candidates.map((c) => (
                          <li key={`${d.id}-${c.index}`} className={`flex gap-3 ${chosen && chosen.thumb === c.thumb ? "rounded-media bg-wash p-2" : ""}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={c.thumb} alt="" className="h-16 w-24 shrink-0 rounded-media object-cover" />
                            <div className="min-w-0 text-kicker leading-snug text-muted">
                              <p className="text-ink">
                                {c.index}. {c.role} · {c.source}
                              </p>
                              <p className="truncate">{c.title ?? "untitled"}</p>
                              {typeof c.relevance === "number" ? (
                                <p>
                                  relevance {c.relevance} · quality {c.quality}
                                  {c.misleading ? " · misleading" : ""}
                                  {c.cliche ? " · cliché" : ""}
                                  {c.setting ? ` · ${c.setting}` : ""}
                                  {c.synthetic ? " · synthetic" : ""}
                                </p>
                              ) : null}
                              {c.note ? <p className="line-clamp-2">{c.note}</p> : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                      {Array.isArray(trace.sceneErrors) && (trace.sceneErrors as string[]).length ? (
                        <p className="mt-2 text-kicker text-signal">{(trace.sceneErrors as string[]).join(" · ")}</p>
                      ) : null}
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No decisions yet." detail="The desk records every story's picture choice here from the next one written." />
        )}
      </section>
    </DashboardShell>
  );
}
