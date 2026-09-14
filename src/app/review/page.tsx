import Link from "next/link";
import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireReviewer } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatTimeAgo } from "@/lib/format/datetime";

export const metadata: Metadata = {
  title: "Review — Newsroom",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The review queue.
 *
 * Stories the engine published that nobody has judged yet, newest first,
 * and the day's sample of stories it chose not to write. Reviewers do not
 * approve anything: what they answer becomes the labels the engine learns
 * from. One story at a time, about a minute each.
 */
export default async function ReviewHomePage(props: { searchParams: Promise<{ done?: string }> }) {
  const user = await requireReviewer("/review");
  const { done } = await props.searchParams;
  const supabase = await createClient();

  const [{ data: queue }, { data: missed }] = await Promise.all([
    supabase.rpc("engine_review_queue", { p_limit: 60 }),
    supabase.rpc("engine_missed_queue", { p_limit: 40 }),
  ]);

  const first = queue?.[0] ?? null;

  return (
    <DashboardShell
      user={user}
      title="Review"
      standfirst="Read what went live and say what you made of it. Nothing here approves or removes a story; your answers teach the engine what this paper values."
    >
      {done ? (
        <p className="mt-6 border-l-2 border-accent pl-4 text-body text-ink">
          Nothing left to review right now. Thank you. New stories arrive through the day.
        </p>
      ) : null}

      <section className="mt-8 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-section text-ink">Published stories</h2>
          <p className="mt-1 text-body text-muted">
            {queue?.length
              ? `${queue.length} waiting. For each: how important, were we early or late, how well made, anything wrong.`
              : "Nothing waiting."}
          </p>
          {first ? (
            <Link
              href={`/review/${first.slug}`}
              className="mt-4 inline-block rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90"
            >
              Start reviewing
            </Link>
          ) : null}
        </div>
        <div>
          <h2 className="text-section text-ink">Stories the engine skipped</h2>
          <p className="mt-1 text-body text-muted">
            {missed?.length
              ? `${missed.length} to judge. One question each: should we have written it?`
              : "Nothing waiting. A fresh sample is drawn each morning."}
          </p>
          {missed?.length ? (
            <Link
              href="/review/missed"
              className="mt-4 inline-block rounded-control border border-hairline px-5 py-2.5 text-body text-ink hover:border-muted"
            >
              Judge the skipped stories
            </Link>
          ) : null}
        </div>
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">How to rate</h2>
        <ul className="mt-3 max-w-measure list-disc space-y-1.5 pl-5 text-body leading-relaxed text-ink">
          <li><span className="font-semibold">Importance.</span> 5, front page at any serious paper. 4, lead of its section. 3, a solid story. 2, filler. 1, should not exist.</li>
          <li><span className="font-semibold">Timing.</span> Against when the world first reported it, which the page shows you. Early, on time, late, or stale.</li>
          <li><span className="font-semibold">Quality.</span> Writing, accuracy, headline, picture and section, taken together.</li>
          <li><span className="font-semibold">Issues.</span> Tick whatever applies. Wrong section asks which section it should be.</li>
          <li><span className="font-semibold">Would not run.</span> Only for a story that should not have been published at all. It counts three times, so use it rarely.</li>
        </ul>
        <p className="mt-3 max-w-measure text-meta text-muted">
          No single review moves the engine. Every verdict is blended with the others and with what the wider press went on to cover, and a change goes live only when it beats what came before.
        </p>
      </section>

      {queue?.length ? (
        <section className="mt-12 border-t border-hairline pt-6">
          <h2 className="text-section text-ink">Waiting</h2>
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {queue.map((item) => (
              <li key={item.article_id} className="py-3">
                <Link href={`/review/${item.slug}`} className="text-body text-ink hover:text-accent">
                  {item.headline}
                </Link>
                <p className="mt-0.5 text-meta text-muted">
                  {item.category_name}
                  {item.published_at ? ` · ${formatTimeAgo(item.published_at)}` : ""}
                  {item.reviews ? ` · ${item.reviews} of ${item.needed} reviews done` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </DashboardShell>
  );
}
