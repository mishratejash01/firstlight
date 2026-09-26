"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Session = {
  signedIn: boolean;
  name: string | null;
  roles: string[];
};

/**
 * The signed-in area of the masthead.
 *
 * Resolved in the browser rather than on the server on purpose. Reading the
 * session during render means calling cookies(), which would make every page
 * that shows the header dynamic — including section fronts, which are exactly
 * the pages worth caching at the edge on a news site.
 *
 * Until the session is known this renders nothing rather than "Sign in".
 * Guessing wrong and showing a sign-in link to someone already signed in is the
 * more confusing failure, and it is the one that was happening.
 *
 * Most readers have never signed in, and for them the answer is known from the
 * absence of a session cookie, without the auth library: it is the largest
 * script on the site, and it is fetched only for readers who have a session to
 * show or keep fresh.
 */
function hasSessionCookie(): boolean {
  return document.cookie
    .split("; ")
    .some((row) => /^sb-[^=]+-auth-token(?:\.\d+)?=/.test(row));
}

export function AccountMenu() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;
    let started = false;
    let unsubscribe: (() => void) | undefined;

    async function start() {
      if (!hasSessionCookie()) {
        if (active) setSession({ signedIn: false, name: null, roles: [] });
        return;
      }
      if (started) return;
      started = true;

      const { createClient } = await import("@/lib/supabase/client");
      if (!active) return;
      const supabase = createClient();

      async function resolve() {
        const { data } = await supabase.auth.getClaims();
        const claims = data?.claims;

        if (!claims?.sub) {
          if (active) setSession({ signedIn: false, name: null, roles: [] });
          return;
        }

        const { data: roleRows } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", claims.sub);

        if (!active) return;
        setSession({
          signedIn: true,
          name:
            typeof claims.email === "string" ? claims.email.split("@")[0] : null,
          roles: (roleRows ?? []).map((row) => row.role),
        });
      }

      void resolve();

      // Keep the header honest if the reader signs in or out in another tab.
      const { data: sub } = supabase.auth.onAuthStateChange(() => {
        void resolve();
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    }

    void start();

    // A reader who signs in in another tab comes back to this one with a
    // session cookie it did not have when the page loaded.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !started) void start();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe?.();
    };
  }, []);

  if (!session) {
    // Reserves the space so the masthead does not shift when it resolves.
    return <span className="inline-block h-4 w-16" aria-hidden="true" />;
  }

  if (!session.signedIn) {
    return (
      <Link
        href="/login"
        className="rounded-control bg-signal px-3 py-1.5 text-meta font-semibold whitespace-nowrap text-paper transition-opacity hover:opacity-90"
      >
        Sign in
      </Link>
    );
  }

  const isAdmin = session.roles.includes("admin");
  const isEditor = isAdmin || session.roles.includes("editor");
  const isAuthor = isEditor || session.roles.includes("author");

  return (
    <span className="flex items-baseline gap-4">
      {/* Newsroom links appear only for the roles that can use them. */}
      {isAdmin ? (
        <Link href="/admin" className="text-meta text-accent underline-offset-4 hover:underline">
          Admin
        </Link>
      ) : null}
      {isEditor ? (
        <Link href="/desk" className="text-meta text-accent underline-offset-4 hover:underline">
          Desk
        </Link>
      ) : null}
      {isAuthor ? (
        <Link
          href="/contribute"
          className="hidden text-meta text-accent underline-offset-4 hover:underline sm:inline"
        >
          My work
        </Link>
      ) : null}
      <Link href="/account" className="text-meta text-ink underline-offset-4 hover:underline">
        {session.name ?? "Profile"}
      </Link>
    </span>
  );
}
