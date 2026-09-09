import Link from "next/link";
import type { Metadata } from "next";

import { ActionButton } from "@/components/dashboard/action-button";
import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { AutonomousControls } from "@/components/dashboard/autonomous-controls";
import { TopicForm } from "@/components/dashboard/topic-form";
import { requireEditorial } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format/datetime";
import { deleteTopic, setTopicActive } from "@/app/admin/topic-actions";

export const metadata: Metadata = {
  title: "AI topics — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Autonomous publishing: the topic list and its controls.
 *
 * The state of the switch is stated at the top in plain words, because the
 * difference between "drafts are waiting for you" and "articles are going live
 * unread" is the most consequential fact on this screen and should not have to
 * be inferred from a toggle position.
 */
export default async function AdminTopicsPage() {
  const user = await requireEditorial("/admin/topics");
  const supabase = await createClient();

  const [{ data: topics }, { data: categories }, { data: settings }, { count: aiPublished }] =
    await Promise.all([
      supabase
        .from("ai_topics")
        .select("id, topic, angle, cadence_hours, is_active, last_generated_at, times_generated, last_error, categories ( name )")
        .order("created_at", { ascending: false }),
      supabase
        .from("categories")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase.from("site_settings").select("key, value"),
      supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("ai_assisted", true)
        .in("status", ["published", "scheduled"]),
    ]);

  const setting = (key: string) =>
    (settings ?? []).find((row) => row.key === key)?.value;

  const enabled = setting("autonomous_publishing_enabled") === true;
  const dailyLimit = Number(setting("autonomous_daily_limit") ?? 6);
  const delayMinutes = Number(setting("autonomous_publish_delay_minutes") ?? 0);
  const isAdmin = user.roles.includes("admin");

  return (
    <DashboardShell
      user={user}
      title="AI topics"
      standfirst="Standing briefs the scheduler writes from, and the controls that govern it."
    >
      <AdminNav current="/admin/topics" />

      <section className="pt-8">
        {enabled ? (
          <div className="border-l-2 border-signal pl-4">
            <p className="text-meta font-semibold text-signal">
              Autonomous publishing is ON
            </p>
            <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
              The scheduler writes and publishes articles from the topics below
              without anyone reading them first. Up to {dailyLimit} per day
              {delayMinutes > 0
                ? `, each becoming visible ${delayMinutes} minutes after it is written`
                : ", visible immediately"}
              . {aiPublished ?? 0} AI-written article
              {aiPublished === 1 ? " is" : "s are"} currently live.
            </p>
          </div>
        ) : (
          <div className="border-l-2 border-hairline pl-4">
            <p className="text-body text-ink">Autonomous publishing is off</p>
            <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
              The schedule runs but does nothing. Topics below are inert until
              it is switched on.
            </p>
          </div>
        )}
      </section>

      {isAdmin ? (
        <section className="mt-10 border-t border-hairline pt-6">
          <h2 className="text-section text-ink">Controls</h2>
          <AutonomousControls
            enabled={enabled}
            dailyLimit={dailyLimit}
            delayMinutes={delayMinutes}
          />
        </section>
      ) : null}

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">
          Topics ({topics?.length ?? 0})
        </h2>
        <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
          Each is a standing brief. Cadence is the minimum gap before the same
          topic is written about again — without it the site fills with
          variations on one idea.
        </p>

        {topics?.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {topics.map((topic) => {
              const category = topic.categories as unknown as { name: string } | null;
              return (
                <li key={topic.id} className="py-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="max-w-measure text-body text-ink">{topic.topic}</p>
                    <span className="shrink-0 text-meta text-muted">
                      {topic.is_active ? "Active" : "Paused"}
                    </span>
                  </div>

                  {topic.angle ? (
                    <p className="mt-1 max-w-measure text-meta text-muted">
                      Angle: {topic.angle}
                    </p>
                  ) : null}

                  <p className="mt-1 text-meta text-muted">
                    {category?.name} · every {topic.cadence_hours}h · written{" "}
                    {topic.times_generated} time{topic.times_generated === 1 ? "" : "s"}
                    {topic.last_generated_at
                      ? ` · last ${formatDateTime(topic.last_generated_at)}`
                      : " · never"}
                  </p>

                  {topic.last_error ? (
                    <p className="mt-2 border-l-2 border-signal pl-3 text-meta text-signal">
                      Last run failed: {topic.last_error}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton
                      action={setTopicActive}
                      hidden={{
                        topic_id: topic.id,
                        is_active: topic.is_active ? "false" : "true",
                      }}
                      label={topic.is_active ? "Pause" : "Resume"}
                      pendingLabel="Updating…"
                    />
                    <ActionButton
                      action={deleteTopic}
                      hidden={{ topic_id: topic.id }}
                      label="Delete"
                      pendingLabel="Deleting…"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="No topics yet."
            detail="Add one below. The scheduler works through active topics oldest-first, respecting each one's cadence."
          />
        )}
      </section>

      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="text-section text-ink">Add a topic</h2>
        <TopicForm categories={categories ?? []} />
      </section>

      <p className="mt-10 border-t border-hairline pt-6 max-w-measure text-meta leading-relaxed text-muted">
        Every AI-written article records which of its claims the model could not
        verify. Those are listed on the article in the desk, and published pieces
        carry a disclosure line. See{" "}
        <Link href="/editorial-standards" className="text-accent underline underline-offset-4">
          editorial standards
        </Link>{" "}
        for what readers are told.
      </p>
    </DashboardShell>
  );
}
