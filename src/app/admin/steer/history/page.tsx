import Link from "next/link";
import type { Metadata } from "next";

import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { readTranscript, SteerTranscript } from "@/components/dashboard/steer-transcript";
import { listAccounts } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { commissionBriefSchema } from "@/lib/ai/steer";
import { formatDateTime, formatTimeAgo } from "@/lib/format/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Steering history — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const DIRECTIVE_STATUS: Record<string, string> = {
  active: "In force",
  expired: "Ended",
  deleted: "Removed",
  drafting: "Never settled",
};

const COMMISSION_STATUS: Record<string, string> = {
  drafting: "Never settled",
  queued: "Queued",
  writing: "Being written",
  done: "Written",
  failed: "Failed",
  deleted: "Withdrawn",
};

const TTL_LABEL = (hours: number | null) =>
  hours === null ? "until removed" : hours % 24 === 0 && hours >= 48 ? `${hours / 24} days` : `${hours} hours`;

type CommissionImage = { url?: string; alt?: string; caption?: string; credit?: string };

/**
 * Everything ever asked of the engine, with the dialogue that settled it.
 *
 * The main Steer page shows what is in force now; this is the record. Each
 * entry opens to the full exchange — every question, every answer, the
 * engine's final statement — and, for a commission, the brief the writer
 * worked from and what became of it.
 */
export default async function AdminSteerHistoryPage() {
  const user = await requireAdmin("/admin/steer/history");
  const supabase = await createClient();

  const [{ data: directives }, { data: commissions }, accounts] = await Promise.all([
    supabase
      .from("engine_directives")
      .select("id, prompt, understanding, status, ttl_hours, transcript, activated_at, expires_at, deleted_at, created_at, created_by")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("commissioned_posts")
      .select(
        "id, prompt, understanding, status, images, brief, transcript, last_error, attempts, created_at, created_by, articles ( slug, status, headline, published_at, categories ( slug ) )",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    listAccounts(),
  ]);

  const emailOf = new Map<string, string>();
  if (accounts.ok) for (const account of accounts.accounts) emailOf.set(account.id, account.email ?? account.id);
  const who = (id: string | null) => (id ? (emailOf.get(id) ?? "an administrator") : "an administrator");

  return (
    <DashboardShell
      user={user}
      title="Steering history"
      standfirst="Every instruction and every commission, with the dialogue that settled it."
      actions={
        <Link href="/admin/steer" className="text-meta text-accent underline underline-offset-4">
          Back to Steer
        </Link>
      }
    >
      <AdminNav current="/admin/steer" />

      <section className="pt-8">
        <h2 className="text-section text-ink">Instructions ({directives?.length ?? 0})</h2>
        {directives?.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {directives.map((directive) => (
              <li key={directive.id} className="py-4">
                <details>
                  <summary className="cursor-pointer list-none">
                    <p className="text-meta text-muted">
                      {DIRECTIVE_STATUS[directive.status] ?? directive.status} · for {TTL_LABEL(directive.ttl_hours)} · given{" "}
                      {formatTimeAgo(directive.created_at)} by {who(directive.created_by)}
                    </p>
                    <p className="mt-1 max-w-measure text-body text-ink">
                      {directive.understanding ?? `“${directive.prompt}”`}
                    </p>
                    <p className="mt-1 text-meta text-accent">Open the dialogue</p>
                  </summary>

                  <div className="mt-4 border-t border-hairline pt-4">
                    <dl className="grid gap-x-6 gap-y-2 text-meta sm:grid-cols-2">
                      <div>
                        <dt className="text-muted">Asked for</dt>
                        <dd className="max-w-measure text-ink">“{directive.prompt}”</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Given</dt>
                        <dd className="text-ink">{formatDateTime(directive.created_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Took effect</dt>
                        <dd className="text-ink">{directive.activated_at ? formatDateTime(directive.activated_at) : "Never"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">
                          {directive.status === "deleted" ? "Removed" : directive.status === "expired" ? "Ended" : "Ends"}
                        </dt>
                        <dd className="text-ink">
                          {directive.status === "deleted" && directive.deleted_at
                            ? formatDateTime(directive.deleted_at)
                            : directive.expires_at
                              ? formatDateTime(directive.expires_at)
                              : directive.activated_at
                                ? "When removed"
                                : "—"}
                        </dd>
                      </div>
                    </dl>
                    <h3 className="mt-4 text-body font-semibold text-ink">The dialogue</h3>
                    <SteerTranscript transcript={readTranscript(directive.transcript)} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No instruction has been given yet." detail="Instructions appear here from the moment the dialogue opens, settled or not." />
        )}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Commissions ({commissions?.length ?? 0})</h2>
        {commissions?.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {commissions.map((post) => {
              const article = post.articles as unknown as {
                slug: string;
                status: string;
                headline: string;
                published_at: string | null;
                categories: { slug: string } | null;
              } | null;
              const href = article?.categories ? `/${article.categories.slug}/${article.slug}` : null;
              const brief = commissionBriefSchema.safeParse(post.brief);
              const images = (Array.isArray(post.images) ? post.images : []) as CommissionImage[];
              return (
                <li key={post.id} className="py-4">
                  <details>
                    <summary className="cursor-pointer list-none">
                      <p className="text-meta text-muted">
                        {COMMISSION_STATUS[post.status] ?? post.status}
                        {article ? ` · article ${article.status}` : ""} · {formatTimeAgo(post.created_at)} by {who(post.created_by)}
                      </p>
                      <p className="mt-1 max-w-measure text-body text-ink">
                        {article?.headline ?? post.understanding ?? `“${post.prompt}”`}
                      </p>
                      <p className="mt-1 text-meta text-accent">Open the brief and the dialogue</p>
                    </summary>

                    <div className="mt-4 border-t border-hairline pt-4">
                      <dl className="grid gap-x-6 gap-y-2 text-meta sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <dt className="text-muted">Asked for</dt>
                          <dd className="max-w-measure whitespace-pre-line text-ink">“{post.prompt}”</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Asked</dt>
                          <dd className="text-ink">{formatDateTime(post.created_at)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Outcome</dt>
                          <dd className="text-ink">
                            {article && href ? (
                              <Link href={href} className="text-accent underline underline-offset-4">
                                {article.headline}
                              </Link>
                            ) : (
                              (COMMISSION_STATUS[post.status] ?? post.status)
                            )}
                            {article?.published_at ? ` · ${article.status} ${formatDateTime(article.published_at)}` : ""}
                            {post.attempts ? ` · ${post.attempts} attempt${post.attempts === 1 ? "" : "s"}` : ""}
                          </dd>
                        </div>
                        {post.last_error ? (
                          <div className="sm:col-span-2">
                            <dt className="text-muted">Last error</dt>
                            <dd className="max-w-measure text-signal">{post.last_error}</dd>
                          </div>
                        ) : null}
                      </dl>

                      {images.length ? (
                        <ul className="mt-4 flex flex-wrap gap-3">
                          {images.map((image, index) =>
                            image.url ? (
                              <li key={image.url} className="w-40">
                                {/* The media library's own address; the site's image loader is for pages. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={image.url} alt="" className="h-24 w-40 object-cover" />
                                <p className="mt-1 text-meta text-muted">
                                  {index + 1}. {image.alt}
                                  {image.credit ? ` · ${image.credit}` : ""}
                                </p>
                              </li>
                            ) : null,
                          )}
                        </ul>
                      ) : null}

                      {brief.success ? (
                        <div className="mt-4">
                          <h3 className="text-body font-semibold text-ink">The brief the writer worked from</h3>
                          <dl className="mt-2 grid gap-x-6 gap-y-2 text-meta sm:grid-cols-2">
                            {[
                              ["Section", brief.data.section],
                              ["Headline wanted", brief.data.headlineHint],
                              ["Tone", brief.data.tone],
                              ["The line", brief.data.stance],
                              ["Length", brief.data.lengthWords ? `${brief.data.lengthWords} words` : ""],
                              ["Publish", brief.data.publish === "now" ? "At once" : brief.data.publish === "delay" ? "After the usual delay" : "As a draft"],
                              ["Breaking", brief.data.breaking ? "Yes" : "No"],
                              ["Main picture", brief.data.heroImageIndex ? `Picture ${brief.data.heroImageIndex}` : "Found by the engine"],
                              ["Search", brief.data.research ? `Yes: “${brief.data.searchQuery}”` : "No"],
                              ["Links to read", brief.data.sources.join(", ")],
                              ["Facts supplied", brief.data.facts.join(" · ")],
                              ["Must include", brief.data.mustInclude.join(" · ")],
                              ["Must not", brief.data.avoid.join(" · ")],
                              ["Notes", brief.data.notes],
                            ]
                              .filter(([, value]) => value)
                              .map(([label, value]) => (
                                <div key={label}>
                                  <dt className="text-muted">{label}</dt>
                                  <dd className="max-w-measure text-ink">{value}</dd>
                                </div>
                              ))}
                          </dl>
                        </div>
                      ) : null}

                      <h3 className="mt-4 text-body font-semibold text-ink">The dialogue</h3>
                      <SteerTranscript transcript={readTranscript(post.transcript)} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="Nothing has been commissioned yet." detail="Commissions appear here from the moment the dialogue opens, written or not." />
        )}
      </section>
    </DashboardShell>
  );
}
