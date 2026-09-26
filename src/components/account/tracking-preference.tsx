"use client";

import { useSyncExternalStore } from "react";

import {
  CONSENT_SERVER_SNAPSHOT,
  getConsentServerSnapshot,
  measurementAllowed,
  readConsentCookie,
  readTrackingMode,
  recordChoice,
  subscribeToConsent,
} from "@/lib/analytics/consent";

/**
 * Lets a reader see and change their tracking choice after the fact.
 *
 * A consent banner that appears once and then vanishes forever is not really a
 * choice — if changing your mind means clearing cookies, most people never do.
 * This reads the same cookie the banner writes, so the two can never disagree.
 */
export function TrackingPreference() {
  const consent = useSyncExternalStore(
    subscribeToConsent,
    readConsentCookie,
    getConsentServerSnapshot,
  );
  const mode = useSyncExternalStore(
    subscribeToConsent,
    readTrackingMode,
    getConsentServerSnapshot,
  );

  // Through the same path as the banner, so declining here also deletes the
  // identifier and the analytics cookies.
  function set(state: "granted" | "denied") {
    recordChoice(state);
  }

  if (consent === CONSENT_SERVER_SNAPSHOT || mode === CONSENT_SERVER_SNAPSHOT) {
    // Unreadable during server rendering; the client fills it in immediately.
    return <p className="mt-2 text-meta text-muted">Checking your current choice…</p>;
  }

  const current =
    consent === "granted"
      ? "You have agreed to reading measurement."
      : consent === "denied"
        ? "You have declined reading measurement."
        : measurementAllowed(mode)
          ? "Reading measurement is on: it is on by default for readers in India until 13 May 2027, when you will be asked instead."
          : "You have not made a choice yet.";

  return (
    <div>
      <p className="mt-2 text-body text-ink">{current}</p>
      <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
        Either way we never store your IP address. Declining means we count that
        a page was read, with nothing attached that could identify you.
      </p>

      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => set("granted")}
          aria-pressed={consent === "granted"}
          className={
            consent === "granted"
              ? "rounded-control border border-accent bg-accent px-4 py-2 text-meta text-paper"
              : "rounded-control border border-hairline px-4 py-2 text-meta text-ink hover:border-muted"
          }
        >
          Allow measurement
        </button>
        <button
          type="button"
          onClick={() => set("denied")}
          aria-pressed={consent === "denied"}
          className={
            consent === "denied"
              ? "rounded-control border border-accent bg-accent px-4 py-2 text-meta text-paper"
              : "rounded-control border border-hairline px-4 py-2 text-meta text-ink hover:border-muted"
          }
        >
          Decline
        </button>
      </div>
    </div>
  );
}
