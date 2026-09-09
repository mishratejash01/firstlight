import Link from "next/link";
import type { Metadata } from "next";

import { ActionButton } from "@/components/dashboard/action-button";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PromoteWireItem } from "@/components/dashboard/promote-wire-item";
import { requireEditorial } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatTimeAgo } from "@/lib/format/datetime";
import { rejectWireItem, summariseWireItem } from "@/app/desk/wire-actions";

export const metadata: Metadata = {
  title: "Wire queue — Desk",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The wire review queue.
 *
 * Everything here was fetched by a machine and has been read by nobody. That is
 * the point of the staging table: ingestion cannot put a row anywhere the
 * public site looks, so an unreviewed item is inert until an editor acts on it.
 *
 * Promoting creates a draft, not a published article. It is one step in, not
 * one step out.
 */
export default async function WireQueuePage() {
  const user = await requireEditorial("/desk/wire");
  const supabase = await createClient();

  const [{ data: items }, { data: categories }, { count: promotedCount }] =
    await Promise.all([
      supabase
        .from("wire_items")
        .select(
          "id, title, summary, body, link, author_name, published_at, ingested_at, raw_categories, suggested_category_id, ai_summary, sources ( name, slug )",
        )
        .eq("status", "pending")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(60),
      supabase
        .from("categories")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("wire_items")
        .select("id", { count: "exact", head: true })
        .eq("status", "promoted"),
    ]);

  return (
    <DashboardShell
      user={user}
      title="Wire queue"
      standfirst="Ingested items awaiting a decision. Nothing here is visible to readers."
      actions={
        <Link href="/desk" className="text-meta text-accent underline underline-offset-4">
          Back to the desk
        </Link>
      }
    >
      <p className="max-w-measure text-meta leading-relaxed text-muted">
        Promoting an item creates a draft in the review queue — it does not
        publish anything. Where the licence does not permit reproducing full
        text, the draft is created as a curated item: your own summary plus a
        link to the original, with no body copy carried across.
        {typeof promotedCount === "number" && promotedCount > 0
          ? ` ${promotedCount} item${promotedCount === 1 ? "" : "s"} promoted so far.`
          : null}
      </p>

      {items?.length ? (
        <ul className="mt-6 divide-y divide-hairline border-t border-hairline">
          {items.map((item) => {
            const source = item.sources as unknown as { name: string } | null;
            return (
              <li key={item.id} className="py-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="text-[1.15rem] leading-snug text-ink">
                    {item.title}
                  </h2>
                  <span className="shrink-0 text-meta text-muted">
                    {source?.name}
                    {item.published_at ? ` · ${formatTimeAgo(item.published_at)}` : ""}
                  </span>
                </div>

                {item.author_name ? (
                  <p className="mt-1 text-meta text-muted">By {item.author_name}</p>
                ) : null}

                {item.ai_summary ? (
                  <div className="mt-3 border-l-2 border-hairline pl-3">
                    <p className="text-meta font-semibold text-muted">AI précis</p>
                    <p className="mt-0.5 max-w-measure text-meta leading-relaxed text-ink">
                      {item.ai_summary}
                    </p>
                  </div>
                ) : item.summary ? (
                  <p className="mt-2 max-w-measure text-meta leading-relaxed text-muted">
                    {item.summary}
                  </p>
                ) : null}

                {item.raw_categories?.length ? (
                  <p className="mt-2 text-meta text-muted">
                    Feed subjects: {item.raw_categories.join(", ")}
                  </p>
                ) : null}

                {item.link ? (
                  <p className="mt-2 break-all text-meta">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-accent underline underline-offset-4"
                    >
                      Read the original
                    </a>
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-start gap-3">
                  <PromoteWireItem
                    itemId={item.id}
                    categories={categories ?? []}
                    suggestedCategoryId={item.suggested_category_id}
                  />
                  {!item.ai_summary && (item.body || item.summary) ? (
                    <ActionButton
                      action={summariseWireItem}
                      hidden={{ item_id: item.id }}
                      label="Summarise for the queue"
                      pendingLabel="Summarising…"
                    />
                  ) : null}
                  <ActionButton
                    action={rejectWireItem}
                    hidden={{ item_id: item.id }}
                    label="Not for us"
                    pendingLabel="Discarding…"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState
            title="Nothing waiting."
            detail="Either no wire sources are configured yet, or every ingested item has been dealt with. Feeds are polled every 30 minutes; an administrator can add sources under Administration → Wire feeds."
          />
        </div>
      )}
    </DashboardShell>
  );
}
