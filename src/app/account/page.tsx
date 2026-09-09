import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { NewsletterSignup } from "@/components/site/newsletter-signup";
import { TrackingPreference } from "@/components/account/tracking-preference";
import { UnfollowButton } from "@/components/account/unfollow-button";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format/datetime";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * A reader's own profile.
 *
 * Deliberately rendered in the ordinary site chrome, not the newsroom shell.
 * It previously used the same header as the editor desk and administration,
 * which meant a reader signing in appeared to land inside the newsroom — the
 * page was correct, but everything around it said otherwise.
 *
 * Newsroom links appear here only for people who hold a role, and are presented
 * as a way out of the reader area rather than as the point of the page.
 */
export default async function AccountPage() {
  const user = await requireUser("/account");
  const supabase = await createClient();

  // getUser() rather than the cached claims: the display name and avatar come
  // from the identity provider and are worth a network call on a page someone
  // visits deliberately.
  const { data: authData } = await supabase.auth.getUser();
  const metadata = (authData.user?.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };
  const displayName = metadata.full_name ?? metadata.name ?? null;
  const avatarUrl = metadata.avatar_url ?? metadata.picture ?? null;
  const joined = authData.user?.created_at ?? null;

  const { data: follows } = await supabase
    .from("follows")
    .select("id, target_type, target_id, created_at")
    .order("created_at", { ascending: false });

  const idsByType = (type: string) =>
    (follows ?? []).filter((f) => f.target_type === type).map((f) => f.target_id);

  const [tags, authors, categories, events] = await Promise.all([
    supabase.from("tags").select("id, slug, name").in("id", idsByType("tag")),
    supabase.from("authors").select("id, slug, display_name").in("id", idsByType("author")),
    supabase.from("categories").select("id, slug, name").in("id", idsByType("category")),
    supabase.from("news_events").select("id, slug, title").in("id", idsByType("event")),
  ]);

  const resolve = (type: string, id: string) => {
    if (type === "tag") {
      const t = tags.data?.find((x) => x.id === id);
      return t ? { label: t.name, href: `/topic/${t.slug}`, kind: "Topic" } : null;
    }
    if (type === "author") {
      const a = authors.data?.find((x) => x.id === id);
      return a ? { label: a.display_name, href: `/author/${a.slug}`, kind: "Writer" } : null;
    }
    if (type === "category") {
      const c = categories.data?.find((x) => x.id === id);
      return c ? { label: c.name, href: `/${c.slug}`, kind: "Section" } : null;
    }
    const e = events.data?.find((x) => x.id === id);
    return e ? { label: e.title, href: `/live/${e.slug}`, kind: "Story" } : null;
  };

  const hasNewsroomAccess = user.roles.length > 0;

  return (
    <>
      <SiteHeader />

      <main className="route-enter mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-measure py-10">
          {/* ---------------------------------------------------------- */}
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt=""
                width={56}
                height={56}
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : null}
            <div className="min-w-0">
              <h1 className="font-serif text-[1.75rem] leading-tight text-ink">
                {displayName ?? "Your profile"}
              </h1>
              <p className="mt-0.5 text-meta text-muted">
                {user.email}
                {joined ? ` · reading since ${formatDate(joined)}` : null}
              </p>
            </div>
          </div>

          <form action="/auth/signout" method="post" className="mt-5">
            <button
              type="submit"
              className="rounded-control border border-hairline px-4 py-2 text-meta text-ink hover:border-muted"
            >
              Sign out
            </button>
          </form>

          {/* ---------------------------------------------------------- */}
          <section className="mt-12 border-t border-hairline pt-6">
            <h2 className="font-serif text-section text-ink">Following</h2>

            {follows?.length ? (
              <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
                {follows.map((follow) => {
                  const target = resolve(follow.target_type, follow.target_id);
                  if (!target) return null;
                  return (
                    <li
                      key={follow.id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="min-w-0">
                        <Link href={target.href} className="text-body text-ink hover:text-accent">
                          {target.label}
                        </Link>
                        <p className="text-meta text-muted">{target.kind}</p>
                      </div>
                      <UnfollowButton followId={follow.id} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-3 border-l-2 border-hairline py-1 pl-4">
                <p className="text-body text-ink">You aren&rsquo;t following anything yet.</p>
                <p className="mt-1 text-meta leading-relaxed text-muted">
                  Open any{" "}
                  <Link href="/topic/climate" className="text-accent underline underline-offset-4">
                    topic
                  </Link>{" "}
                  or{" "}
                  <Link href="/masthead" className="text-accent underline underline-offset-4">
                    writer
                  </Link>{" "}
                  and press Follow. What you follow appears here.
                </p>
              </div>
            )}
          </section>

          {/* ---------------------------------------------------------- */}
          <section className="mt-12 border-t border-hairline pt-6">
            <h2 className="font-serif text-section text-ink">Newsletter</h2>
            <div className="mt-4">
              <NewsletterSignup context="account" />
            </div>
          </section>

          {/* ---------------------------------------------------------- */}
          <section className="mt-12 border-t border-hairline pt-6">
            <h2 className="font-serif text-section text-ink">
              How your reading is measured
            </h2>
            <TrackingPreference />
            <p className="mt-3 text-meta text-muted">
              The full detail is on the{" "}
              <Link href="/privacy" className="text-accent underline underline-offset-4">
                privacy page
              </Link>
              .
            </p>
          </section>

          {/* Only shown to people who actually have newsroom access. */}
          {hasNewsroomAccess ? (
            <section className="mt-12 border-t border-hairline pt-6">
              <h2 className="font-serif text-section text-ink">Newsroom</h2>
              <p className="mt-1 text-meta text-muted">
                You have {user.roles.join(" and ")} access.
              </p>
              <ul className="mt-3 space-y-2">
                {user.roles.includes("admin") ? (
                  <li>
                    <Link href="/admin" className="text-body text-accent underline underline-offset-4">
                      Administration
                    </Link>
                  </li>
                ) : null}
                {user.roles.includes("admin") || user.roles.includes("editor") ? (
                  <li>
                    <Link href="/desk" className="text-body text-accent underline underline-offset-4">
                      Editor desk
                    </Link>
                  </li>
                ) : null}
                <li>
                  <Link href="/contribute" className="text-body text-accent underline underline-offset-4">
                    My work
                  </Link>
                </li>
              </ul>
            </section>
          ) : null}
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
