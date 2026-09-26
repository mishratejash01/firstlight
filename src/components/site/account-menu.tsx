"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Loaded only when a reader actually opens it.
 *
 * The card pulls in the Google button, which pulls in the auth library — the
 * largest script on the site, and the one this component goes out of its way
 * not to fetch for the many readers who never sign in. A static import here
 * would hand it to all of them to render a button that says "Sign in".
 */
const LoginCard = dynamic(
  () => import("@/components/auth/login-card").then((m) => m.LoginCard),
  { ssr: false },
);

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

  if (!session.signedIn) return <SignInControl />;

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

/**
 * Sign in, and the card it opens.
 *
 * The card drops out of the masthead rather than sending the reader to a page.
 * Signing in is a two-second detour — one button, and the browser leaves for
 * Google anyway — so taking over the whole window to ask for it loses the
 * reader their place in the story they were reading, for no gain.
 *
 * /login still exists and still renders the same card, because a server guard
 * turning someone away from /desk has to redirect somewhere. What has gone is
 * the journey to it from the masthead.
 *
 * Closes on Escape and on a click outside, and hands focus back to the button
 * it came from.
 */
function SignInControl() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="rounded-control bg-signal px-3 py-1.5 text-meta font-semibold whitespace-nowrap text-paper transition-opacity hover:opacity-90"
      >
        Sign in
      </button>

      {open ? (
        // Anchored to the button's right edge so a card far wider than this
        // slot opens inwards over the page rather than off the side of it.
        <span
          role="dialog"
          aria-label="Sign in"
          className="absolute top-full right-0 z-[70] mt-3 block w-80 text-left"
        >
          <LoginCard />
        </span>
      ) : null}
    </span>
  );
}
