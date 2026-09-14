import Link from "next/link";
import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MissedForm } from "@/components/review/missed-form";
import { requireReviewer } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format/datetime";

export const metadata: Metadata = {
  title: "Skipped stories — Review",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The day's sample of stories the engine chose not to write.
 *
 * The only way the engine can learn about what it fails to pick. Each card
 * shows what the engine saw: the outlets on the story, the first few
 * headlines, when it was first seen, and why triage passed on it if it got
 * that far. One question: should we have written it?
 */
export default async function MissedStoriesPage() {
  const user = await requireReviewer("/review/missed");
  const supabase = await createClient();
  const { data: items } = await supabase.rpc("engine_missed_queue", { p_limit: 40 });

  return (
    <DashboardShell
      user={user}
      title="Stories the engine skipped"
      standfirst="Should we have written it? Yes asks how important it was. That is all."
      actions={
        <Link href="/review" className="text-meta text-accent hover:underline underline-offset-4">
          Back to the queue
        </Link>
      }
    >
      {items?.length ? (
        <ul className="mt-8 divide-y divide-hairline border-t border-hairline">
          {items.map((item) => (
            <li key={item.event_id} className="py-6">
              <h2 className="text-[1.15rem] text-ink">{item.title}</h2>
              <p className="mt-1 text-meta text-muted">
                First seen {formatDateTime(item.first_seen_at)}
                {item.source_count ? ` · ${item.source_count} outlets` : ""}
                {item.score != null ? ` · score ${Number(item.score).toFixed(1)}` : ""}
                {item.reason === "random" ? " · random sample" : ""}
              </p>
              {item.outlets?.length ? (
                <p className="mt-2 text-meta text-muted">On it: {item.outlets.slice(0, 12).join(", ")}{item.outlets.length > 12 ? ` and ${item.outlets.length - 12} more` : ""}</p>
              ) : null}
              {item.headlines?.length ? (
                <ul className="mt-2 space-y-1 text-body text-ink">
                  {item.headlines.map((h, i) => (
                    <li key={i} className="border-l-2 border-hairline pl-3">{h}</li>
                  ))}
                </ul>
              ) : null}
              {item.triage_reason ? (
                <p className="mt-2 text-meta text-muted">The engine said: {item.triage_reason}</p>
              ) : null}
              <MissedForm eventId={item.event_id} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-body text-muted">Nothing to judge right now. A fresh sample is drawn each morning.</p>
      )}
    </DashboardShell>
  );
}
