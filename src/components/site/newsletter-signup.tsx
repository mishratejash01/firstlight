"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Newsletter signup.
 *
 * Calls the subscribe_to_newsletter database function rather than inserting
 * directly. That function returns void whether the address was new, already
 * subscribed, or previously unsubscribed — so this form cannot be used to test
 * whether a given person is on the list. The confirmation message below is
 * identical in every case for the same reason.
 */
export function NewsletterSignup({
  context,
  variant = "plain",
}: {
  context: string;
  /** "panel" at the end of a story; the plain form in the footer and account page. */
  variant?: "plain" | "panel";
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;

    setState("sending");
    // Loaded on submit rather than with the page: this form sits in the footer
    // of every page, and the database library it needs is the largest script
    // on the site, which nobody who does not subscribe should have to download.
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { error } = await createClient().rpc("subscribe_to_newsletter", {
        p_email: email.trim(),
        p_context: context,
      });

      setState(error ? "error" : "done");
      if (!error) setEmail("");
    } catch {
      setState("error");
    }
  }

  const panel = variant === "panel";

  if (state === "done") {
    return (
      <div
        className={
          panel
            ? "tint-panel rounded-panel px-5 py-6 sm:px-8"
            : "border-l-2 border-accent pl-4"
        }
      >
        <p className="text-body font-semibold text-ink">Check your inbox.</p>
        <p className="mt-1 text-meta text-muted">
          If that address is not already subscribed, a confirmation email is on
          its way.
        </p>
      </div>
    );
  }

  // The button takes the paper's red, the same as Sign in in the masthead, so
  // the two things a reader can join the paper with look like one family. It
  // was navy before, which made it read as one more link.
  const field = (
    <div className={`flex flex-col gap-2 sm:flex-row ${panel ? "mt-5" : "mt-3"}`}>
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
        className="rounded-control bg-signal px-5 py-2.5 font-label text-body font-semibold whitespace-nowrap text-white transition hover:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-60"
      >
        {state === "sending" ? "Signing up…" : "Sign up"}
      </button>
    </div>
  );

  const failure =
    state === "error" ? (
      <p role="alert" className="mt-2 text-meta text-signal">
        Could not sign you up just now. Please try again.
      </p>
    ) : null;

  // At the end of a story the briefing gets a panel of its own: the reader has
  // just finished a piece, which is the moment they are most likely to want
  // the next one, so the offer is set apart rather than tucked under a rule.
  if (panel) {
    return (
      <form
        onSubmit={submit}
        className="tint-panel rounded-panel px-5 py-6 sm:px-8 sm:py-7"
      >
        <div className="flex items-start gap-4">
          <Image
            src="/brand/dove.png"
            alt=""
            aria-hidden="true"
            width={256}
            height={256}
            className="mt-0.5 h-11 w-11 shrink-0"
          />
          <div className="min-w-0">
            <label
              htmlFor={`newsletter-${context}`}
              className="block font-headline text-[1.375rem] leading-tight font-semibold text-ink"
            >
              The morning briefing
            </label>
            <p className="mt-1.5 font-dek text-body leading-relaxed text-ink">
              The day&rsquo;s reporting, once each morning. No advertising.
            </p>
          </div>
        </div>
        {field}
        {failure}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-md">
      <label
        htmlFor={`newsletter-${context}`}
        className="text-body font-semibold text-ink"
      >
        The morning briefing
      </label>
      <p className="mt-1 text-meta text-muted">
        The day&rsquo;s reporting, once each morning. No advertising.
      </p>
      {field}
      {failure}
    </form>
  );
}
