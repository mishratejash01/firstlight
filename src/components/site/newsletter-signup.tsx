"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Newsletter signup.
 *
 * Calls the subscribe_to_newsletter database function rather than inserting
 * directly. That function returns void whether the address was new, already
 * subscribed, or previously unsubscribed — so this form cannot be used to test
 * whether a given person is on the list. The confirmation message below is
 * identical in every case for the same reason.
 */
export function NewsletterSignup({ context }: { context: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;

    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.rpc("subscribe_to_newsletter", {
      p_email: email.trim(),
      p_context: context,
    });

    setState(error ? "error" : "done");
    if (!error) setEmail("");
  }

  if (state === "done") {
    return (
      <div className="border-l-2 border-accent pl-4">
        <p className="text-body text-ink">Check your inbox.</p>
        <p className="mt-1 text-meta text-muted">
          If that address is not already subscribed, a confirmation email is on
          its way.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-md">
      <label htmlFor={`newsletter-${context}`} className="text-body font-semibold text-ink">
        The morning briefing
      </label>
      <p className="mt-1 text-meta text-muted">
        The day&rsquo;s reporting, once each morning. No advertising.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id={`newsletter-${context}`}
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="min-w-0 flex-1 rounded-control border border-hairline bg-paper px-3 py-2.5 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="rounded-control border border-accent bg-accent px-4 py-2.5 text-body text-paper transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {state === "sending" ? "Signing up…" : "Sign up"}
        </button>
      </div>

      {state === "error" ? (
        <p role="alert" className="mt-2 text-meta text-signal">
          Could not sign you up just now. Please try again.
        </p>
      ) : null}
    </form>
  );
}
