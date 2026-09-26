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

/**
 * "noted" is a reader in India who has seen the notice that measurement is on
 * by default and left it on. It is not agreement: once the India default ends
 * (see INDIA_DEFAULT_ENDS_AT), a reader who only noted it is asked properly.
 */
export type ConsentState = "granted" | "denied" | "noted" | "unset";

export function parseConsent(value: string | undefined | null): ConsentState {
  if (value === `${CONSENT_VERSION}:granted`) return "granted";
  if (value === `${CONSENT_VERSION}:denied`) return "denied";
  if (value === `${CONSENT_VERSION}:noted`) return "noted";
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

/**
 * Readers in India.
 *
 * India has no rule yet that measurement must wait for agreement: the consent
 * duties of the Digital Personal Data Protection Act and its 2025 Rules begin
 * on 13 May 2027. Until then readers in India are measured by default, told
 * so on their first visit, and can turn it off in one click, there or from
 * Privacy settings. From that date they are asked first, as readers everywhere
 * else already are. The date is written here rather than left to memory, so
 * the change happens on time without anyone having to make it.
 */
export const INDIA_DEFAULT_ENDS_AT = Date.parse("2027-05-13T00:00:00+05:30");

/**
 * Whether the browser is set to India Standard Time, which is how the site
 * tells a reader in India without looking anything up about them. A device
 * usually follows the local time zone when it travels, so the mistake this
 * makes is asking a reader from India first: the safe direction.
 */
export function browserInIndia(): boolean {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone === "Asia/Kolkata" || zone === "Asia/Calcutta";
  } catch {
    return false;
  }
}

/**
 * What the site does for a reader now:
 * - "on": measuring, nothing to show (they agreed, or left the India default on)
 * - "off": not measuring (they declined or turned it off)
 * - "notice": measuring by the India default, with the notice showing
 * - "ask": nothing measured until they choose; the question is showing
 */
export type TrackingMode = "on" | "off" | "notice" | "ask";

export function trackingMode(state: ConsentState, inIndia: boolean, now: number): TrackingMode {
  if (state === "granted") return "on";
  if (state === "denied") return "off";
  if (inIndia && now < INDIA_DEFAULT_ENDS_AT) return state === "noted" ? "on" : "notice";
  return "ask";
}

/** The mode for this browser, read from the consent cookie. Client-side only. */
export function readTrackingMode(): TrackingMode {
  return trackingMode(readConsentCookie(), browserInIndia(), Date.now());
}

/** Whether reading measurement and Google Analytics may run. */
export function measurementAllowed(mode: TrackingMode): boolean {
  return mode === "on" || mode === "notice";
}

/** Browser storage keys that exist only while measurement is allowed: the random reading identifier and its per-tab session. */
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
 * Records a reader's choice and makes it true at once. Declining deletes the
 * reading identifier and the analytics cookies; and because a script that is
 * already running cannot be unloaded, a page that was measuring reloads
 * without it. The banner, the notice and the account page all record through
 * here, so no route to "off" can leave something behind.
 */
export function recordChoice(state: Exclude<ConsentState, "unset">): void {
  if (typeof window === "undefined") return;
  const wasMeasuring = measurementAllowed(readTrackingMode());
  writeConsentCookie(state);
  if (state === "denied") {
    clearTrackingStorage();
    if (wasMeasuring) {
      window.location.reload();
      return;
    }
  }
  notifyConsentChanged();
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
 * Privacy settings: a request, from anywhere on the page, to show the full
 * choice again. Nothing changes until the reader picks, so opening it can
 * never switch measurement on for someone who had turned it off.
 */
const choiceListeners = new Set<Listener>();

export function subscribeToChoiceRequests(listener: Listener): () => void {
  choiceListeners.add(listener);
  return () => {
    choiceListeners.delete(listener);
  };
}

export function requestPrivacyChoice(): void {
  for (const listener of choiceListeners) listener();
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
