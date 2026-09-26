"use client";

import { useState } from "react";

/**
 * Starts the Google OAuth redirect.
 *
 * `next` is passed through to /auth/callback so a reader who was sent to sign
 * in from a protected page returns to it. It is validated server-side in the
 * callback, never trusted here.
 */
export function GoogleSignInButton({ next }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);

    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);

    // The auth library is loaded on the click, not with the page.
    let failedToStart = false;
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString() },
      });
      failedToStart = Boolean(error);
    } catch {
      failedToStart = true;
    }

    // On success the browser is already navigating away, so this only runs when
    // the redirect could not be started at all.
    if (failedToStart) {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="flex w-full items-center justify-center gap-3 rounded-control border border-hairline bg-paper px-4 py-3 text-body font-medium text-ink transition-colors hover:border-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-muted"
      >
        <GoogleMark />
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>

      {failed ? (
        <p role="alert" className="mt-3 text-meta text-signal">
          Could not reach Google. Check your connection and try again.
        </p>
      ) : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
