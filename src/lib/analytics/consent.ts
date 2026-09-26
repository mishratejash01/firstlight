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

/** Browser storage keys that exist only after consent: the random reading identifier and its per-tab session. */
export const ANON_ID_KEY = "nw_anon_id";
export const SESSION_ID_KEY = "nw_session_id";

/**
 * Removes everything consent allowed us to keep in the browser: the reading
 * identifiers, and Google Analytics' cookies on this host and its parent
 * domain. Called when consent is declined or withdrawn.
 */
export function clearTrackingStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ANON_ID_KEY);
  } catch {
    // Storage can be unavailable (private modes); there is then nothing to clear.
  }
  try {
    window.sessionStorage.removeItem(SESSION_ID_KEY);
  } catch {
    // As above.
  }
  const host = window.location.hostname;
  const parent = host.replace(/^www\./, "");
  for (const row of document.cookie.split("; ")) {
    const name = row.split("=")[0];
    if (name !== "_ga" && !name.startsWith("_ga_")) continue;
    for (const domain of ["", `; Domain=${host}`, `; Domain=.${parent}`]) {
      document.cookie = `${name}=; Path=/; Max-Age=0${domain}`;
    }
  }
}

/**
 * Withdraws consent: forgets the stored choice, so the question is asked again,
 * and clears what the earlier choice allowed.
 */
export function resetConsent(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  clearTrackingStorage();
}

/**
 * Subscription plumbing so React can read the consent cookie as external
 * state through useSyncExternalStore, rather than copying it into component
 * state inside an effect. The cookie is the single source of truth; mirroring
 * it into useState would mean two places that can disagree.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Call after writing the cookie so every reader re-renders. */
export function notifyConsentChanged(): void {
  for (const listener of listeners) listener();
}

/**
 * Distinct from "unset" on purpose. During server rendering the cookie is
 * unreadable, and treating that as "unset" would render the consent banner into
 * the HTML for every reader — including those who already answered — producing
 * a visible flash when hydration corrects it.
 */
export const CONSENT_SERVER_SNAPSHOT = "server" as const;

export function getConsentServerSnapshot(): typeof CONSENT_SERVER_SNAPSHOT {
  return CONSENT_SERVER_SNAPSHOT;
}
