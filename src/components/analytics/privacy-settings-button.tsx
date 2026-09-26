"use client";

import {
  notifyConsentChanged,
  readConsentCookie,
  resetConsent,
} from "@/lib/analytics/consent";

/**
 * Reopens the tracking choice from any page.
 *
 * Changing your mind has to be as easy as deciding was, so this sits in the
 * footer of every page: one click forgets the stored choice, clears what it
 * allowed, and brings the question back. If Google Analytics had been loaded,
 * the page reloads so its script is gone before the question is asked again.
 */
export function PrivacySettingsButton({ className }: { className?: string }) {
  function reopen() {
    const wasGranted = readConsentCookie() === "granted";
    resetConsent();
    if (wasGranted) {
      window.location.reload();
      return;
    }
    notifyConsentChanged();
  }

  return (
    <button type="button" onClick={reopen} className={className}>
      Privacy settings
    </button>
  );
}
