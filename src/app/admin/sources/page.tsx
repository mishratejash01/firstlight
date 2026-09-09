import type { Metadata } from "next";

import { ActionButton } from "@/components/dashboard/action-button";
import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { WireSourceForm } from "@/components/dashboard/wire-source-form";
import { RunIngestionButton } from "@/components/dashboard/run-ingestion-button";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format/datetime";
import { setFullTextPermission, setSourceActive } from "@/app/admin/source-actions";

export const metadata: Metadata = {
  title: "Wire sources — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Wire sources and their licence terms.
 *
 * The full-text toggle is the consequential control on this page. When it is
 * off, the database physically refuses to store body copy from that source —
 * an editor who tries gets a constraint violation, not a warning they can click
 * past. Turning it on is an assertion that the contract permits reproduction.
 */
export default async function AdminSourcesPage() {
  const user = await requireAdmin("/admin/sources");
  const supabase = await createClient();

  const { data: sources } = await supabase
    .from("sources")
    .select(
      "id, slug, name, origin, homepage_url, is_active, source_licences ( feed_url, licence_holder, licence_terms, allow_full_text, last_ingested_at, last_ingest_error )",
    )
    .eq("origin", "wire")
    .order("name", { ascending: true });

  const { count: pendingCount } = await supabase
    .from("wire_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <DashboardShell
      user={user}
      title="Wire sources"
      standfirst="Feeds the newsroom ingests, and what each licence permits."
    >
      <AdminNav current="/admin/sources" />

      <section className="pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-serif text-section text-ink">
            Configured sources ({sources?.length ?? 0})
          </h2>
          <RunIngestionButton />
        </div>

        <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
          Ingestion runs every 30 minutes. Items land in the desk&rsquo;s wire
          queue for review — nothing from a feed reaches the public site without
          an editor promoting it.
          {typeof pendingCount === "number" && pendingCount > 0
            ? ` ${pendingCount} item${pendingCount === 1 ? "" : "s"} waiting now.`
            : null}
        </p>

        {sources?.length ? (
          <ul className="mt-5 divide-y divide-hairline border-t border-hairline">
            {sources.map((source) => {
              const licence = source.source_licences as unknown as {
                feed_url: string | null;
                licence_holder: string | null;
                licence_terms: string | null;
                allow_full_text: boolean;
                last_ingested_at: string | null;
                last_ingest_error: string | null;
              } | null;

              return (
                <li key={source.id} className="py-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="font-serif text-[1.1rem] text-ink">{source.name}</h3>
                    <span className="text-meta text-muted">
                      {source.is_active ? "Active" : "Paused"}
                    </span>
                  </div>

                  <p className="mt-1 break-all text-meta text-muted">
                    {licence?.feed_url ?? "No feed configured"}
                  </p>

                  <p className="mt-1 text-meta text-muted">
                    {licence?.last_ingested_at
                      ? `Last checked ${formatDateTime(licence.last_ingested_at)}`
                      : "Never checked"}
                    {licence?.licence_holder ? ` · licensed from ${licence.licence_holder}` : ""}
                  </p>

                  {licence?.last_ingest_error ? (
                    <p className="mt-2 border-l-2 border-signal pl-3 text-meta text-signal">
                      Last run failed: {licence.last_ingest_error}
                    </p>
                  ) : null}

                  <p className="mt-2 max-w-measure text-meta leading-relaxed text-ink">
                    {licence?.allow_full_text
                      ? "Full text may be reproduced under this licence."
                      : "Summary and attribution link only. The database will reject any attempt to store body copy from this source."}
                  </p>

                  {licence?.licence_terms ? (
                    <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
                      {licence.licence_terms}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton
                      action={setFullTextPermission}
                      hidden={{
                        source_id: source.id,
                        allow_full_text: licence?.allow_full_text ? "false" : "true",
                      }}
                      label={
                        licence?.allow_full_text
                          ? "Restrict to summary only"
                          : "Permit full text"
                      }
                      pendingLabel="Updating…"
                    />
                    <ActionButton
                      action={setSourceActive}
                      hidden={{
                        source_id: source.id,
                        is_active: source.is_active ? "false" : "true",
                      }}
                      label={source.is_active ? "Pause ingestion" : "Resume ingestion"}
                      pendingLabel="Updating…"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="No wire sources yet."
            detail="Add a feed below. Any RSS or Atom feed works — a licensed wire service, a government press office, a regulator's announcements page. Ingestion starts on the next run."
          />
        )}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="font-serif text-section text-ink">Add a wire source</h2>
        <WireSourceForm />
      </section>
    </DashboardShell>
  );
}
