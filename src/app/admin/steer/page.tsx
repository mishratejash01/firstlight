import Link from "next/link";
import type { Metadata } from "next";

import { ActionButton } from "@/components/dashboard/action-button";
import { AdminNav } from "@/components/dashboard/admin-nav";
import { CommissionForm } from "@/components/dashboard/commission-form";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SteerNewInstruction } from "@/components/dashboard/steer-new-instruction";
import { requireAdmin } from "@/lib/auth/guards";
import { formatDateTime, formatTimeAgo } from "@/lib/format/datetime";
import { createClient } from "@/lib/supabase/server";
import { deleteCommission, deleteDirective, writeCommissionNow } from "@/app/admin/steer-actions";

export const metadata: Metadata = {
  title: "Steer — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** "in 3 hours", "in 2 days", or "now" for something already past. */
function timeLeft(iso: string, now = Date.now()): string {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

const COMMISSION_STATUS: Record<string, string> = {
  drafting: "Dialogue not finished",
  queued: "Queued for the desk",
  writing: "Being written",
  done: "Written",
  failed: "Failed",
};

/**
 * Steering: what the engine should cover, and stories the editor wants.
 *
 * Both are settled in a dialogue before they take effect, and both show
 * here in the engine's own words, so what is in force is never a matter
 * of memory.
 */
export default async function AdminSteerPage() {
  const user = await requireAdmin("/admin/steer");
  const supabase = await createClient();

  const [{ data: active }, { data: past }, { data: commissions }] = await Promise.all([
    supabase
      .from("engine_directives")
      .select("id, prompt, understanding, ttl_hours, activated_at, expires_at, created_at")
      .eq("status", "active")
      .order("activated_at", { ascending: false }),
    supabase
      .from("engine_directives")
      .select("id, prompt, understanding, status, activated_at, expires_at, deleted_at")
      .in("status", ["expired", "deleted"])
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("commissioned_posts")
      .select(
        "id, prompt, understanding, status, last_error, attempts, created_at, articles ( slug, status, headline, categories ( slug ) )",
      )
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <DashboardShell
      user={user}
      title="Steer"
      standfirst="Tell the engine what to cover, and commission the stories you want."
    >
      <AdminNav current="/admin/steer" />

      <section className="pt-8">
        <h2 className="text-section text-ink">Standing instructions</h2>
        <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
          An instruction comes before everything else the engine knows: which stories are considered,
          what share of the output a subject gets, what is never written, and how it is written. Each
          one is settled with the engine first, holds for the time you choose, and then has no effect
          at all. Remove one and it stops that moment.
        </p>

        {active?.length ? (
          <ul className="mt-5 divide-y divide-hairline border-t border-hairline">
            {active.map((directive) => (
              <li key={directive.id} className="py-5">
                <p className="max-w-measure text-body leading-relaxed text-ink">{directive.understanding}</p>
                <p className="mt-2 max-w-measure text-meta leading-relaxed text-muted">
                  You asked: &ldquo;{directive.prompt}&rdquo;
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="text-meta text-muted">
                    In force since {directive.activated_at ? formatTimeAgo(directive.activated_at) : "—"} ·{" "}
                    {directive.expires_at
                      ? `ends ${timeLeft(directive.expires_at)} (${formatDateTime(directive.expires_at)})`
                      : "holds until removed"}
                  </span>
                  <ActionButton
                    action={deleteDirective}
                    hidden={{ directive_id: directive.id }}
                    label="Remove now"
                    pendingLabel="Removing…"
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No instruction is in force."
            detail="The engine is choosing stories on its own judgement. Give it an instruction below and it will follow that instead, for as long as you say."
          />
        )}

        <h3 className="mt-8 text-body font-semibold text-ink">Give an instruction</h3>
        <SteerNewInstruction />
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Commission a story</h2>
        <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
          One story, written the way you want it: your brief, your facts, your pictures, your line.
          The engine settles the brief with you, then the desk writes it ahead of everything else
          and publishes it as you asked. A commission is not bound by the standing instructions.
        </p>
        <CommissionForm />

        {commissions?.length ? (
          <ul className="mt-8 divide-y divide-hairline border-t border-hairline">
            {commissions.map((post) => {
              const article = post.articles as unknown as {
                slug: string;
                status: string;
                headline: string;
                categories: { slug: string } | null;
              } | null;
              const href = article?.categories ? `/${article.categories.slug}/${article.slug}` : null;
              return (
                <li key={post.id} className="py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-meta text-muted">
                      {COMMISSION_STATUS[post.status] ?? post.status}
                      {article ? ` · article ${article.status}` : ""} · {formatTimeAgo(post.created_at)}
                    </p>
                  </div>
                  {article && href ? (
                    <Link href={href} className="mt-1 block text-body text-ink hover:text-accent">
                      {article.headline}
                    </Link>
                  ) : (
                    <p className="mt-1 max-w-measure text-body text-ink">{post.understanding ?? post.prompt}</p>
                  )}
                  {post.last_error ? (
                    <p className="mt-1 max-w-measure text-meta text-signal">{post.last_error}</p>
                  ) : null}
                  {post.status === "queued" || post.status === "failed" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton
                        action={writeCommissionNow}
                        hidden={{ commission_id: post.id }}
                        label={post.status === "failed" ? "Try again now" : "Write it now"}
                        pendingLabel="Writing… this takes up to a minute"
                        variant="primary"
                      />
                      <ActionButton
                        action={deleteCommission}
                        hidden={{ commission_id: post.id }}
                        label="Withdraw"
                        pendingLabel="Withdrawing…"
                      />
                    </div>
                  ) : post.status === "drafting" ? (
                    <div className="mt-3">
                      <ActionButton
                        action={deleteCommission}
                        hidden={{ commission_id: post.id }}
                        label="Discard"
                        pendingLabel="Discarding…"
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {past?.length ? (
        <section className="mt-12 border-t border-hairline pt-6">
          <h2 className="text-section text-ink">Past instructions</h2>
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {past.map((directive) => (
              <li key={directive.id} className="py-3">
                <p className="max-w-measure text-meta text-ink">{directive.understanding ?? directive.prompt}</p>
                <p className="mt-1 text-meta text-muted">
                  {directive.status === "deleted"
                    ? `Removed ${directive.deleted_at ? formatTimeAgo(directive.deleted_at) : ""}`
                    : `Ended ${directive.expires_at ? formatTimeAgo(directive.expires_at) : ""}`}
                  {directive.activated_at ? ` · was in force from ${formatDateTime(directive.activated_at)}` : " · never took effect"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </DashboardShell>
  );
}
