/**
 * Tracking consent.
 *
 * Stored in a first-party cookie rather than localStorage so the server can
 * read it during render and decide whether an event may carry an identifier at
 * all. A localStorage flag is invisible to the server, which would leave the
 * server-side logger guessing.
 */

export const CONSENT_COOKIE = "nw_consent";
export const CONSENT_VERSION = "v1";
/** Twelve months, after which we ask again rather than assuming. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type ConsentState = "granted" | "denied" | "unset";

export function parseConsent(value: string | undefined | null): ConsentState {
  if (value === `${CONSENT_VERSION}:granted`) return "granted";
  if (value === `${CONSENT_VERSION}:denied`) return "denied";
  // An unrecognised or older version means the question needs asking again.
  return "unset";
}

export function serialiseConsent(state: Exclude<ConsentState, "unset">): string {
  return `${CONSENT_VERSION}:${state}`;
}

/** Client-side read. Returns 'unset' during SSR, where document is absent. */
export function readConsentCookie(): ConsentState {
  if (typeof document === "undefined") return "unset";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(match?.slice(CONSENT_COOKIE.length + 1));
}

export function writeConsentCookie(state: Exclude<ConsentState, "unset">): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${CONSENT_COOKIE}=${serialiseConsent(state)}` +
    `; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}
