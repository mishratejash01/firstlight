import type { Metadata } from "next";

import { ActionButton } from "@/components/dashboard/action-button";
import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FeedPipelineFigure } from "@/components/dashboard/feed-pipeline-figure";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { hostOfUrl } from "@/lib/engine/hosts";
import { runFeedsNow, setExpandedFeeds, setFeedSwitch } from "@/app/admin/feed-actions";

export const metadata: Metadata = {
  title: "Feed switches — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type FeedRow = {
  id: string;
  name: string;
  homepage_url: string | null;
  is_active: boolean;
  expanded: boolean;
  source_licences: { feed_url: string | null; last_ingest_error: string | null } | null;
};

type Stats = { events_started: number; stories_written: number };

const STATS_HOURS = 24;

/**
 * Every direct feed the engine reads, with its switch, and one master switch
 * over the feeds added on 12 September 2026.
 *
 * Kept to what someone needs in order to act: the state, the button, three
 * rules, and two numbers per feed. The full explanation is on the page but
 * folded away, so it is there when wanted and not in the way when not.
 */
export default async function AdminFeedsPage() {
  const user = await requireAdmin("/admin/feeds");
  const supabase = await createClient();

  const [{ data: sources }, { data: setting }, { data: statRows }] = await Promise.all([
    supabase
      .from("sources")
      .select(
        "id, name, homepage_url, is_active, expanded, source_licences!inner ( feed_url, last_ingest_error )",
      )
      .eq("origin", "wire")
      .order("name", { ascending: true }),
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", "engine_expanded_feeds_enabled")
      .maybeSingle(),
    supabase.rpc("engine_feed_stats", { p_hours: STATS_HOURS }),
  ]);

  const masterOn = setting?.value === true;
  const stats = new Map<string, Stats>(
    (statRows ?? []).map((row) => [
      row.source_id,
      { events_started: Number(row.events_started), stories_written: Number(row.stories_written) },
    ]),
  );

  const feeds = ((sources ?? []) as unknown as FeedRow[]).filter((s) => s.source_licences?.feed_url);
  const expanded = feeds.filter((f) => f.expanded);
  const founding = feeds.filter((f) => !f.expanded);

  return (
    <DashboardShell
      user={user}
      title="Feed switches"
      standfirst="Turn news feeds on and off. Nothing here can touch a published story."
    >
      <AdminNav current="/admin/feeds" />

      <section className="pt-8">
        <p className="text-lead text-ink">
          New feeds: <span className="font-semibold">{masterOn ? "ON" : "OFF"}</span>
        </p>
        <p className="mt-1 max-w-measure text-body text-muted">
          {masterOn
            ? `The ${expanded.length} feeds added on 12 September are running.`
            : `The ${expanded.length} feeds added on 12 September are stopped. The engine is running on the original ${founding.length} feeds only.`}
        </p>

        <div className="mt-4 flex flex-wrap items-start gap-3">
          <ActionButton
            action={setExpandedFeeds}
            hidden={{ enabled: masterOn ? "false" : "true" }}
            label={masterOn ? "Turn new feeds OFF" : "Turn new feeds ON"}
            pendingLabel="Updating…"
            variant="primary"
          />
          <ActionButton
            action={runFeedsNow}
            hidden={{}}
            label="Check feeds now"
            pendingLabel="Checking…"
          />
        </div>

        <ul className="mt-6 max-w-measure list-disc space-y-2 pl-5 text-body leading-relaxed text-ink">
          <li>
            <span className="font-semibold">OFF</span> stops the new feeds within a minute. The
            engine goes back to exactly how it was before they were added.
          </li>
          <li>
            <span className="font-semibold">ON</span> brings them back within five minutes.
          </li>
          <li>
            <span className="font-semibold">Neither</span> removes or changes a story that is
            already on the site. Take a story down from the desk.
          </li>
        </ul>
      </section>

      <FeedTable
        heading="New feeds"
        note={`Covered by the master switch above. Each one also has its own switch. Numbers are for the last ${STATS_HOURS} hours.`}
        feeds={expanded}
        masterOn={masterOn}
        stats={stats}
      />

      <FeedTable
        heading="Original feeds"
        note="Not covered by the master switch. Switch these one at a time."
        feeds={founding}
        masterOn
        stats={stats}
      />

      <details className="mt-12 border-t border-hairline pt-6">
        <summary className="cursor-pointer text-body text-accent">
          Full explanation: how a feed becomes a story, and what the switches do
        </summary>

        <div className="mt-5 overflow-x-auto">
          <FeedPipelineFigure />
        </div>

        <ol className="mt-6 max-w-measure list-decimal space-y-3 pl-5 text-body leading-relaxed text-ink">
          <li>
            <span className="font-semibold">Publisher feed.</span> Each row above is one RSS feed
            an outlet publishes itself.
          </li>
          <li>
            <span className="font-semibold">Poller, every 5 minutes.</span> Reads every feed that
            is on and stores new entries. A feed that is off, or a new feed while the master
            switch is off, is skipped here.
          </li>
          <li>
            <span className="font-semibold">Engine pulse, every minute.</span> Turns fresh entries
            into mentions, the same kind of mention a Google News hit becomes, with the
            outlet&rsquo;s authority weight. Entries from a feed that is off are not read in
            even if fetched a moment earlier. That is why OFF takes a minute, not five.
          </li>
          <li>
            <span className="font-semibold">Story events.</span> Mentions about the same story
            are clustered and scored. Several feeds from one paper count as one source.
          </li>
          <li>
            <span className="font-semibold">Triage and desk.</span> Events over the score line are
            triaged, checked against two or three independent sources, then written. None of
            this changes with a switch. A feed adds evidence; it cannot lower the bar.
          </li>
          <li>
            <span className="font-semibold">Live story.</span> Out of reach of every switch on
            this page.
          </li>
        </ol>

        <h3 className="mt-8 text-[1.1rem] text-ink">If a feed brings rubbish</h3>
        <ol className="mt-2 max-w-measure list-decimal space-y-2 pl-5 text-body leading-relaxed text-ink">
          <li>Find it in the table: many events started, no stories written, or stories you do not want.</li>
          <li>Switch that one feed off. The rest keep running.</li>
          <li>If it is all of them, turn the master switch off.</li>
          <li>Unwanted stories already live come down from the desk, one at a time.</li>
          <li>Events already created from that feed expire on their own within 36 hours.</li>
        </ol>

        <h3 className="mt-8 text-[1.1rem] text-ink">The two numbers</h3>
        <dl className="mt-2 grid max-w-measure gap-x-6 gap-y-2 text-body sm:grid-cols-[max-content_1fr]">
          <dt className="font-semibold text-ink">Started</dt>
          <dd className="text-ink">Events where this feed was the first source of any kind to report the story. High means the feed is making the engine faster.</dd>
          <dt className="font-semibold text-ink">Stories</dt>
          <dd className="text-ink">Events this feed contributed to that the desk went on to write. High started, zero stories means candidates nobody wants.</dd>
        </dl>
      </details>
    </DashboardShell>
  );
}

function FeedTable({
  heading,
  note,
  feeds,
  masterOn,
  stats,
}: {
  heading: string;
  note: string;
  feeds: FeedRow[];
  masterOn: boolean;
  stats: Map<string, Stats>;
}) {
  return (
    <section className="mt-12 border-t border-hairline pt-6">
      <h2 className="text-section text-ink">
        {heading} ({feeds.length})
      </h2>
      <p className="mt-1 max-w-measure text-meta text-muted">{note}</p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-body">
          <thead>
            <tr className="border-b border-hairline text-left text-meta text-muted">
              <th className="py-2 pr-4 font-normal">Feed</th>
              <th className="py-2 pr-4 text-right font-normal">Started</th>
              <th className="py-2 pr-4 text-right font-normal">Stories</th>
              <th className="py-2 pr-4 font-normal">State</th>
              <th className="py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {feeds.map((feed) => {
              const s = stats.get(feed.id);
              const running = feed.is_active && masterOn;
              const state = !feed.is_active ? "Off" : masterOn ? "On" : "Off by master switch";
              const error = feed.source_licences?.last_ingest_error;
              const host = feed.homepage_url ? hostOfUrl(feed.homepage_url) : null;

              return (
                <tr key={feed.id} className="border-b border-hairline align-top">
                  <td className="py-3 pr-4">
                    <span className="text-ink">{feed.name}</span>
                    {host ? <span className="ml-2 text-meta text-muted">{host}</span> : null}
                    {error ? (
                      <span className="mt-1 block text-meta text-signal">Last check failed: {error}</span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-right text-ink">{s?.events_started ?? 0}</td>
                  <td className="py-3 pr-4 text-right text-ink">{s?.stories_written ?? 0}</td>
                  <td className={running ? "py-3 pr-4 text-ink" : "py-3 pr-4 text-muted"}>{state}</td>
                  <td className="py-3">
                    <ActionButton
                      action={setFeedSwitch}
                      hidden={{ source_id: feed.id, is_active: feed.is_active ? "false" : "true" }}
                      label={feed.is_active ? "Turn off" : "Turn on"}
                      pendingLabel="Updating…"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
