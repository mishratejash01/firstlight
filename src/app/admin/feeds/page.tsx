import type { Metadata } from "next";

import { ActionButton } from "@/components/dashboard/action-button";
import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FeedPipelineFigure } from "@/components/dashboard/feed-pipeline-figure";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format/datetime";
import { hostOfUrl } from "@/lib/engine/hosts";
import { runFeedsNow, setExpandedFeeds, setFeedSwitch } from "@/app/admin/feed-actions";

export const metadata: Metadata = {
  title: "Feed switches — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type FeedRow = {
  id: string;
  slug: string;
  name: string;
  homepage_url: string | null;
  is_active: boolean;
  expanded: boolean;
  source_licences: {
    feed_url: string | null;
    last_ingested_at: string | null;
    last_ingest_error: string | null;
  } | null;
};

type Stats = {
  items: number;
  events_touched: number;
  events_started: number;
  stories_written: number;
};

const STATS_HOURS = 24;

/**
 * Every direct feed the engine reads, each with its own switch, and the one
 * master switch over the expanded wave.
 *
 * Written for whoever is on duty when a feed starts bringing rubbish, which is
 * why the explanation is longer than the controls. The controls are two
 * buttons; the explanation is what makes pressing one safe.
 */
export default async function AdminFeedsPage() {
  const user = await requireAdmin("/admin/feeds");
  const supabase = await createClient();

  const [{ data: sources }, { data: setting }, { data: statRows }, { data: authorityRows }] =
    await Promise.all([
      supabase
        .from("sources")
        .select(
          "id, slug, name, homepage_url, is_active, expanded, source_licences!inner ( feed_url, last_ingested_at, last_ingest_error )",
        )
        .eq("origin", "wire")
        .order("name", { ascending: true }),
      supabase
        .from("site_settings")
        .select("value")
        .eq("key", "engine_expanded_feeds_enabled")
        .maybeSingle(),
      supabase.rpc("engine_feed_stats", { p_hours: STATS_HOURS }),
      supabase.from("source_authority").select("host, weight"),
    ]);

  const expandedOn = setting?.value === true;
  const stats = new Map<string, Stats>(
    (statRows ?? []).map((row) => [
      row.source_id,
      {
        items: Number(row.items),
        events_touched: Number(row.events_touched),
        events_started: Number(row.events_started),
        stories_written: Number(row.stories_written),
      },
    ]),
  );
  const authority = new Map((authorityRows ?? []).map((r) => [r.host, Number(r.weight)]));

  const feeds = ((sources ?? []) as unknown as FeedRow[]).filter((s) => s.source_licences?.feed_url);
  const expanded = feeds.filter((f) => f.expanded);
  const founding = feeds.filter((f) => !f.expanded);
  const expandedRunning = expandedOn ? expanded.filter((f) => f.is_active).length : 0;

  return (
    <DashboardShell
      user={user}
      title="Feed switches"
      standfirst="Every direct feed the engine reads, one switch each, and one master switch over the expanded wave."
    >
      <AdminNav current="/admin/feeds" />

      {/* ------------------------------------------------------------------ */}
      <section className="pt-8">
        <h2 className="text-section text-ink">Master switch</h2>

        <div className="mt-4 border-l-2 border-accent pl-4">
          <p className="text-lead text-ink">
            Expanded feeds are {expandedOn ? "on" : "off"}.
          </p>
          <p className="mt-1 text-body text-muted">
            {expandedOn
              ? `${expandedRunning} of the ${expanded.length} expanded feeds are being polled. Any of them with its own switch off is not.`
              : `None of the ${expanded.length} expanded feeds is being polled, whatever its own switch says. The ${founding.length} founding feeds and every Google stream are running as normal.`}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-start gap-3">
          <ActionButton
            action={setExpandedFeeds}
            hidden={{ enabled: expandedOn ? "false" : "true" }}
            label={expandedOn ? "Switch off all expanded feeds" : "Switch on all expanded feeds"}
            pendingLabel="Updating…"
            variant={expandedOn ? "quiet" : "primary"}
          />
          <ActionButton
            action={runFeedsNow}
            hidden={{}}
            label="Poll every switched-on feed now"
            pendingLabel="Polling…"
          />
        </div>

        <p className="mt-4 max-w-measure text-body leading-relaxed text-ink">
          This is the revert. If the new feeds bring noise, press it and the
          engine is back to exactly what it was before they were added, within
          a minute. Nothing already published moves. Pressing it again brings
          the feeds back within five minutes.
        </p>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="text-section text-ink">How a feed becomes a story, and where a switch cuts</h2>

        <div className="mt-5 overflow-x-auto">
          <FeedPipelineFigure />
        </div>

        <ol className="mt-6 max-w-measure list-decimal space-y-3 pl-5 text-body leading-relaxed text-ink">
          <li>
            <span className="font-semibold">Publisher feed.</span> Each row on
            this page is one RSS feed an outlet publishes. Nothing is scraped:
            the outlet chose to offer the feed.
          </li>
          <li>
            <span className="font-semibold">Poller, every 5 minutes.</span> It
            reads every feed that is switched on and stores new entries as wire
            items. <span className="text-accent">Cut 1:</span> a feed whose
            switch is off, or an expanded feed while the master switch is off,
            is skipped here.
          </li>
          <li>
            <span className="font-semibold">Engine pulse, every minute.</span> It
            turns fresh wire items into mentions, the same kind of mention a
            Google News hit becomes, with the outlet&rsquo;s authority weight
            attached. <span className="text-accent">Cut 2:</span> items from a
            switched-off feed are not read in, even if they were fetched
            moments before the switch was pressed. This is what makes
            &ldquo;off&rdquo; take effect within a minute rather than five.
          </li>
          <li>
            <span className="font-semibold">Story events.</span> Mentions that
            describe the same story are clustered into one event and scored.
            Two feeds from the same paper count as one source; the engine
            keys outlets by their website, not by feed.
          </li>
          <li>
            <span className="font-semibold">Triage and desk.</span> Events over
            the score line go to triage, then the verification gate (two or
            three independent sources), then the desk writes them. None of
            that changes with these switches. A feed only ever adds evidence;
            it cannot lower the bar.
          </li>
          <li>
            <span className="font-semibold">Live story.</span> Out of reach of
            every switch on this page. Taking a story down is done from the
            desk, deliberately, one story at a time.
          </li>
        </ol>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="text-section text-ink">What each switch does</h2>

        <div className="mt-5 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="text-[1.1rem] text-ink">The master switch</h3>
            <p className="mt-2 max-w-measure text-body leading-relaxed text-ink">
              <span className="font-semibold">On:</span> every feed in the
              expanded wave whose own switch is on is polled every five
              minutes and its entries enter the engine.
            </p>
            <p className="mt-2 max-w-measure text-body leading-relaxed text-ink">
              <span className="font-semibold">Off:</span> no expanded feed is
              polled, and entries already fetched from them stop entering the
              engine at the next pulse. The founding feeds, the Google front
              pages and searches, trends and every other stream carry on
              unchanged. The engine behaves exactly as it did before the wave
              was added.
            </p>
            <p className="mt-2 max-w-measure text-body leading-relaxed text-muted">
              It does not touch the founding feeds. Those predate the wave and
              answer only to their own switches.
            </p>
          </div>

          <div>
            <h3 className="text-[1.1rem] text-ink">A feed&rsquo;s own switch</h3>
            <p className="mt-2 max-w-measure text-body leading-relaxed text-ink">
              <span className="font-semibold">On:</span> the feed is polled and
              read in, provided the master switch also allows it for expanded
              feeds.
            </p>
            <p className="mt-2 max-w-measure text-body leading-relaxed text-ink">
              <span className="font-semibold">Off:</span> that one feed is
              skipped at both cuts. Use it when a single outlet is the problem,
              so the rest of the wave keeps running.
            </p>
            <p className="mt-2 max-w-measure text-body leading-relaxed text-muted">
              A feed switched off individually stays off when the master
              switch is turned on again. Switches are never overridden
              silently.
            </p>
          </div>
        </div>

        <div className="mt-8 max-w-measure border-l-2 border-hairline pl-4">
          <h3 className="text-[1.1rem] text-ink">What no switch ever does</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-body leading-relaxed text-ink">
            <li>Remove, unpublish or edit a story that is already live.</li>
            <li>Change the score line, the triage prompt, the verification gate or the 24-hour age ceiling.</li>
            <li>Stop the Google streams, trends, corroboration searches or the desk itself.</li>
            <li>Delete story events already created. Candidates from a switched-off feed simply age out, within 36 hours at most.</li>
          </ul>
        </div>

        <div className="mt-8 max-w-measure">
          <h3 className="text-[1.1rem] text-ink">How soon a change takes effect</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-body leading-relaxed text-ink">
            <li>Switching off: within one minute. The next pulse stops reading the feed&rsquo;s items.</li>
            <li>Switching on: within five minutes, at the next poll. Or press &ldquo;Poll every switched-on feed now&rdquo; above.</li>
            <li>A feed&rsquo;s first poll after switching on brings up to 60 of its latest entries. Anything older than 36 hours is discarded by the engine, so a newly added feed cannot flood the desk with yesterday&rsquo;s news.</li>
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="text-section text-ink">If noise appears</h2>
        <ol className="mt-4 max-w-measure list-decimal space-y-3 pl-5 text-body leading-relaxed text-ink">
          <li>
            Find the feed. In the table below, a feed with many events started
            and few or no stories written is generating candidates the desk
            keeps rejecting. A feed whose stories are the ones you dislike is
            visible on the Events page, where each story lists its sources.
          </li>
          <li>
            Switch that feed off. The rest of the wave keeps running.
          </li>
          <li>
            If it is the wave as a whole, switch the master switch off. The
            engine is back to its previous self within a minute.
          </li>
          <li>
            Any unwanted story already live comes down from the desk, one at a
            time. No switch here will do it for you, by design.
          </li>
          <li>
            Give it a day, then look at the counters again. Switch a feed back
            on only when you have a reason to.
          </li>
        </ol>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="text-section text-ink">Reading the counters</h2>
        <p className="mt-2 max-w-measure text-body leading-relaxed text-muted">
          All figures cover the last {STATS_HOURS} hours and are computed from
          the database when the page loads.
        </p>
        <dl className="mt-4 grid max-w-measure gap-x-8 gap-y-3 text-body sm:grid-cols-[max-content_1fr]">
          <dt className="font-semibold text-ink">Authority</dt>
          <dd className="text-ink">The weight the engine gives this outlet as a source, from 0.4 to 2.0. Wire agencies sit at 2.0, the BBC at 1.8, most national papers between 1.2 and 1.7. Several feeds from one outlet share one weight.</dd>
          <dt className="font-semibold text-ink">Items</dt>
          <dd className="text-ink">Entries the poller fetched from this feed.</dd>
          <dt className="font-semibold text-ink">Started</dt>
          <dd className="text-ink">Story events where this feed was the first source of any kind to report the story. This is the number that says whether a feed is making the engine faster.</dd>
          <dt className="font-semibold text-ink">Touched</dt>
          <dd className="text-ink">Story events this feed contributed a mention to, first or not.</dd>
          <dt className="font-semibold text-ink">Stories</dt>
          <dd className="text-ink">Events this feed touched that the desk went on to write. A feed with a high Started figure and a Stories figure near zero is producing candidates nobody wants.</dd>
        </dl>
      </section>

      {/* ------------------------------------------------------------------ */}
      <FeedTable
        heading={`Expanded wave (${expanded.length})`}
        note="Governed by the master switch and by each feed's own switch."
        feeds={expanded}
        masterOn={expandedOn}
        stats={stats}
        authority={authority}
      />
      <FeedTable
        heading={`Founding feeds (${founding.length})`}
        note="Each answers only to its own switch. The master switch does not touch these."
        feeds={founding}
        masterOn
        stats={stats}
        authority={authority}
      />
    </DashboardShell>
  );
}

function FeedTable({
  heading,
  note,
  feeds,
  masterOn,
  stats,
  authority,
}: {
  heading: string;
  note: string;
  feeds: FeedRow[];
  masterOn: boolean;
  stats: Map<string, Stats>;
  authority: Map<string, number>;
}) {
  return (
    <section className="mt-12 border-t border-hairline pt-8">
      <h2 className="text-section text-ink">{heading}</h2>
      <p className="mt-1 max-w-measure text-meta text-muted">{note}</p>

      {feeds.length ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[840px] border-collapse text-meta">
            <thead>
              <tr className="border-b border-hairline text-left text-muted">
                <th className="py-2 pr-4 font-normal">Feed</th>
                <th className="py-2 pr-4 font-normal">Outlet</th>
                <th className="py-2 pr-4 text-right font-normal">Authority</th>
                <th className="py-2 pr-4 text-right font-normal">Items</th>
                <th className="py-2 pr-4 text-right font-normal">Started</th>
                <th className="py-2 pr-4 text-right font-normal">Touched</th>
                <th className="py-2 pr-4 text-right font-normal">Stories</th>
                <th className="py-2 pr-4 font-normal">Last checked</th>
                <th className="py-2 pr-4 font-normal">State</th>
                <th className="py-2 font-normal">Switch</th>
              </tr>
            </thead>
            <tbody>
              {feeds.map((feed) => {
                const host = feed.homepage_url ? hostOfUrl(feed.homepage_url) : null;
                const weight = host ? authority.get(host) : undefined;
                const s = stats.get(feed.id);
                const running = feed.is_active && masterOn;
                const state = !feed.is_active
                  ? "Off"
                  : masterOn
                    ? "Running"
                    : "Held by master switch";
                const licence = feed.source_licences;

                return (
                  <tr key={feed.id} className="border-b border-hairline align-top">
                    <td className="py-3 pr-4">
                      <span className="text-body text-ink">{feed.name}</span>
                      {licence?.last_ingest_error ? (
                        <span className="mt-1 block text-signal">
                          Last run failed: {licence.last_ingest_error}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-muted">{host ?? "unknown"}</td>
                    <td className="py-3 pr-4 text-right text-ink">
                      {weight !== undefined ? weight.toFixed(1) : "0.8"}
                    </td>
                    <td className="py-3 pr-4 text-right text-ink">{s?.items ?? 0}</td>
                    <td className="py-3 pr-4 text-right text-ink">{s?.events_started ?? 0}</td>
                    <td className="py-3 pr-4 text-right text-ink">{s?.events_touched ?? 0}</td>
                    <td className="py-3 pr-4 text-right text-ink">{s?.stories_written ?? 0}</td>
                    <td className="py-3 pr-4 text-muted">
                      {licence?.last_ingested_at ? formatDateTime(licence.last_ingested_at) : "Never"}
                    </td>
                    <td className={running ? "py-3 pr-4 text-ink" : "py-3 pr-4 text-muted"}>
                      {state}
                    </td>
                    <td className="py-3">
                      <ActionButton
                        action={setFeedSwitch}
                        hidden={{ source_id: feed.id, is_active: feed.is_active ? "false" : "true" }}
                        label={feed.is_active ? "Switch off" : "Switch on"}
                        pendingLabel="Updating…"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-body text-muted">No feeds in this group.</p>
      )}
    </section>
  );
}
