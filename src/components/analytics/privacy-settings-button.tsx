"use client";

import { requestPrivacyChoice } from "@/lib/analytics/consent";

/**
 * Reopens the tracking choice from any page.
 *
 * Changing your mind has to be as easy as deciding was, so this sits in the
 * footer of every page. One click brings back the full question; nothing
 * changes until it is answered, so opening it can never switch measurement on
 * for a reader who had turned it off. Declining clears what measurement kept
 * in the browser, and reloads the page if Google Analytics was running.
 */
export function PrivacySettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={requestPrivacyChoice} className={className}>
      Privacy settings
    </button>
  );
}
