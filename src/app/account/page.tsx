import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { NewsletterSignup } from "@/components/site/newsletter-signup";
import { EmailLink } from "@/components/site/email-link";
import { SectionMark } from "@/components/site/section-mark";
import { TrackingPreference } from "@/components/account/tracking-preference";
import { UnfollowButton } from "@/components/account/unfollow-button";
import { requireUser } from "@/lib/auth/guards";
import { getAllSections } from "@/lib/queries/navigation";
import { PUBLISHER } from "@/lib/site";
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
 * Laid out as a profile rather than a settings form: who you are across the
 * top, what you follow and how your reading is measured in the wide column,
 * and the briefing, your data and (for staff) the newsroom in a column beside
 * it. It was one narrow column of sections between rules, centred in a wide
 * screen, which read as a form left half-built.
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
  // The letter shown when the identity provider sends no picture.
  const initial = (displayName ?? user.email ?? "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  const { data: follows } = await supabase
    .from("follows")
    .select("id, target_type, target_id, created_at")
    .order("created_at", { ascending: false });

  const idsByType = (type: string) =>
    (follows ?? [])
      .filter((f) => f.target_type === type)
      .map((f) => f.target_id);

  const [tags, authors, categories, events, sections] = await Promise.all([
    supabase.from("tags").select("id, slug, name").in("id", idsByType("tag")),
    supabase
      .from("authors")
      .select("id, slug, display_name")
      .in("id", idsByType("author")),
    supabase
      .from("categories")
      .select("id, slug, name")
      .in("id", idsByType("category")),
    supabase
      .from("news_events")
      .select("id, slug, title")
      .in("id", idsByType("event")),
    // Section marks for followed sections, from the cached list the header and
    // footer already read (and which copes with the icon column being absent).
    getAllSections(),
  ]);
  const iconBySlug = new Map(
    sections.map((section) => [section.slug, section.icon_url]),
  );

  const resolve = (type: string, id: string) => {
    if (type === "tag") {
      const t = tags.data?.find((x) => x.id === id);
      return t
        ? { label: t.name, href: `/topic/${t.slug}`, kind: "Topic", icon: null }
        : null;
    }
    if (type === "author") {
      const a = authors.data?.find((x) => x.id === id);
      return a
        ? {
            label: a.display_name,
            href: `/author/${a.slug}`,
            kind: "Writer",
            icon: null,
          }
        : null;
    }
    if (type === "category") {
      const c = categories.data?.find((x) => x.id === id);
      return c
        ? {
            label: c.name,
            href: `/${c.slug}`,
            kind: "Section",
            icon: iconBySlug.get(c.slug) ?? null,
          }
        : null;
    }
    const e = events.data?.find((x) => x.id === id);
    return e
      ? { label: e.title, href: `/live/${e.slug}`, kind: "Story", icon: null }
      : null;
  };

  const followed = (follows ?? [])
    .map((follow) => ({
      follow,
      target: resolve(follow.target_type, follow.target_id),
    }))
    .filter(
      (
        row,
      ): row is {
        follow: (typeof row)["follow"];
        target: NonNullable<(typeof row)["target"]>;
      } => Boolean(row.target),
    );

  const hasNewsroomAccess = user.roles.length > 0;
  // Requests about a reader's data go where the privacy page sends them: the
  // grievance officer, or the general inbox if no officer's address is set.
  const dataRequests = PUBLISHER.grievanceOfficer.email || PUBLISHER.email;

  const heading =
    "font-headline text-[1.5rem] leading-tight font-semibold text-ink";
  const link = "text-accent underline underline-offset-4";

  return (
    <>
      <SiteHeader />

      <main className="route-enter mx-auto max-w-page px-4 pb-16 sm:px-6">
        {/* Who you are: picture or initial, name, address and since when,
            and the way out. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-5 py-10">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={80}
              height={80}
              className="h-16 w-16 shrink-0 rounded-full object-cover sm:h-20 sm:w-20"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent font-headline text-[1.75rem] font-semibold text-paper sm:h-20 sm:w-20 sm:text-[2.25rem]"
            >
              {initial}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-headline text-[1.875rem] leading-tight font-semibold text-ink sm:text-[2.25rem]">
              {displayName ?? "Your profile"}
            </h1>
            <p className="mt-1 text-meta text-muted">
              {user.email}
              {joined ? ` · reading since ${formatDate(joined)}` : null}
            </p>
          </div>
          {/* Its own row on a phone, so the name keeps the width beside the
              picture instead of wrapping word by word. */}
          <form action="/auth/signout" method="post" className="w-full sm:w-auto">
            <button
              type="submit"
              className="w-full rounded-control border border-ink px-5 py-2.5 font-label text-body font-semibold text-ink transition hover:bg-ink hover:text-paper sm:w-auto"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          {/* The wide column: what you follow, and how your reading is
              measured. */}
          <div className="min-w-0 space-y-12">
            <section aria-labelledby="following-heading">
              <h2 id="following-heading" className={heading}>
                Following
              </h2>

              {followed.length ? (
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {followed.map(({ follow, target }) => (
                    <li
                      key={follow.id}
                      className="tint-panel flex items-center justify-between gap-4 rounded-panel px-4 py-3.5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {target.icon ? (
                          <SectionMark src={target.icon} className="h-8 w-8" />
                        ) : null}
                        <div className="min-w-0">
                          <Link
                            href={target.href}
                            className="block truncate font-headline text-[1.0625rem] font-semibold text-ink underline-offset-4 hover:underline"
                          >
                            {target.label}
                          </Link>
                          <p className="text-meta text-muted">{target.kind}</p>
                        </div>
                      </div>
                      <UnfollowButton followId={follow.id} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="tint-panel mt-5 rounded-panel px-5 py-5">
                  <p className="text-body font-semibold text-ink">
                    You aren&rsquo;t following anything yet.
                  </p>
                  <p className="mt-1 text-meta leading-relaxed text-ink">
                    Open any{" "}
                    <Link href="/sections" className={link}>
                      section
                    </Link>
                    , topic or{" "}
                    <Link href="/masthead" className={link}>
                      writer
                    </Link>{" "}
                    and press Follow. What you follow appears here.
                  </p>
                </div>
              )}
            </section>

            <section aria-labelledby="measurement-heading">
              <h2 id="measurement-heading" className={heading}>
                How your reading is measured
              </h2>
              <TrackingPreference />
              <p className="mt-3 text-meta text-muted">
                The full detail is on the{" "}
                <Link href="/privacy" className={link}>
                  privacy page
                </Link>
                .
              </p>
            </section>
          </div>

          {/* The side column: the briefing, your data, and the newsroom for
              those who work in it. */}
          <aside className="space-y-10">
            <NewsletterSignup context="account" variant="panel" />

            {dataRequests ? (
              <section aria-labelledby="data-heading">
                <h2
                  id="data-heading"
                  className="font-headline text-[1.25rem] leading-tight font-semibold text-ink"
                >
                  Your data
                </h2>
                <p className="mt-2 text-meta leading-relaxed text-ink">
                  For a copy of what we hold about your account, a correction to
                  it, or the deletion of the account and everything stored
                  against it, write to{" "}
                  <EmailLink
                    address={dataRequests}
                    subject="Request about my account data"
                  />{" "}
                  from {user.email ?? "the email address you sign in with"}.
                </p>
              </section>
            ) : null}

            {/* Only shown to people who actually have newsroom access. */}
            {hasNewsroomAccess ? (
              <section aria-labelledby="newsroom-heading">
                <h2
                  id="newsroom-heading"
                  className="font-headline text-[1.25rem] leading-tight font-semibold text-ink"
                >
                  Newsroom
                </h2>
                <p className="mt-1 text-meta text-muted">
                  You have {user.roles.join(" and ")} access.
                </p>
                <ul className="mt-3 space-y-2">
                  {user.roles.includes("admin") ? (
                    <li>
                      <Link href="/admin" className={`text-body ${link}`}>
                        Administration
                      </Link>
                    </li>
                  ) : null}
                  {user.roles.includes("admin") ||
                  user.roles.includes("editor") ? (
                    <li>
                      <Link href="/desk" className={`text-body ${link}`}>
                        Editor desk
                      </Link>
                    </li>
                  ) : null}
                  <li>
                    <Link href="/contribute" className={`text-body ${link}`}>
                      My work
                    </Link>
                  </li>
                </ul>
              </section>
            ) : null}
          </aside>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
