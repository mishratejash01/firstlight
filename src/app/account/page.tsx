import Link from "next/link";
import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { UnfollowButton } from "@/components/account/unfollow-button";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Reader account.
 *
 * What a reader gets for signing in: their follows, and a plain statement of
 * what role they hold. An account with no role is a reader — signing in is not
 * an application for newsroom access, and the page says so rather than leaving
 * someone wondering why there is no publish button.
 */
export default async function AccountPage() {
  const user = await requireUser("/account");
  const supabase = await createClient();

  const { data: follows } = await supabase
    .from("follows")
    .select("id, target_type, target_id, created_at")
    .order("created_at", { ascending: false });

  // Resolve names in one round trip per type rather than one per follow.
  const idsByType = (type: string) =>
    (follows ?? []).filter((f) => f.target_type === type).map((f) => f.target_id);

  const [tags, authors, categories, events] = await Promise.all([
    supabase.from("tags").select("id, slug, name").in("id", idsByType("tag")),
    supabase.from("authors").select("id, slug, display_name").in("id", idsByType("author")),
    supabase.from("categories").select("id, slug, name").in("id", idsByType("category")),
    supabase.from("news_events").select("id, slug, title").in("id", idsByType("event")),
  ]);

  const nameFor = (type: string, id: string) => {
    if (type === "tag") {
      const t = tags.data?.find((x) => x.id === id);
      return t ? { label: t.name, href: `/topic/${t.slug}` } : null;
    }
    if (type === "author") {
      const a = authors.data?.find((x) => x.id === id);
      return a ? { label: a.display_name, href: `/author/${a.slug}` } : null;
    }
    if (type === "category") {
      const c = categories.data?.find((x) => x.id === id);
      return c ? { label: c.name, href: `/${c.slug}` } : null;
    }
    const e = events.data?.find((x) => x.id === id);
    return e ? { label: e.title, href: `/live/${e.slug}` } : null;
  };

  return (
    <DashboardShell
      user={user}
      title="Your account"
      standfirst={
        user.roles.length
          ? `Signed in as ${user.roles.join(", ")}.`
          : "Signed in as a reader. Newsroom access is granted separately by an administrator."
      }
    >
      <section>
        <h2 className="font-serif text-section text-ink">Following</h2>

        {follows?.length ? (
          <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
            {follows.map((follow) => {
              const target = nameFor(follow.target_type, follow.target_id);
              if (!target) return null;
              return (
                <li key={follow.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <Link href={target.href} className="text-body text-ink hover:text-accent">
                      {target.label}
                    </Link>
                    <p className="text-meta text-muted capitalize">{follow.target_type}</p>
                  </div>
                  <UnfollowButton followId={follow.id} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-body text-muted">
            You are not following anything yet. Follow a topic or a writer from
            any article page and it will appear here.
          </p>
        )}
      </section>

      <section className="mt-10 border-t border-hairline pt-6">
        <h2 className="font-serif text-section text-ink">Privacy</h2>
        <p className="mt-2 max-w-measure text-body leading-relaxed text-muted">
          What this site records about how you read it, and how to change your
          tracking choice, is set out on the{" "}
          <Link href="/privacy" className="text-accent underline underline-offset-4">
            privacy page
          </Link>
          .
        </p>
      </section>
    </DashboardShell>
  );
}
