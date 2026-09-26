/**
 * Date and time presentation.
 *
 * News readers need two different things from a timestamp: how fresh is this,
 * and when exactly was it. The front page wants the first, an article page
 * wants both, and a machine reading our structured data wants ISO 8601.
 */

const RELATIVE_CUTOFF_HOURS = 24;

/**
 * Every clock time on the site is Indian Standard Time, labelled as such. The
 * servers run on UTC, and a time printed without a zone would silently show
 * readers in India the wrong hour. Search engines also check that the visible
 * date matches the date in structured data.
 */
export const TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/** '2 hours ago' inside a day, otherwise an absolute date. */
export function formatTimeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < RELATIVE_CUTOFF_HOURS) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  return formatDate(iso);
}

/** '9 September 2026' */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
}

/** '9 September 2026 at 14:20 IST' */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} at ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  })} IST`;
}

/** '14:32' — used for live blog update stamps. */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

/**
 * ISO 8601 in Indian Standard Time, e.g. "2026-09-20T14:09:05+05:30": the
 * same instant as the stored UTC value, written in the zone readers see, for
 * structured data and article meta tags.
 */
export function toIstIso(iso: string): string;
export function toIstIso(iso: string | null | undefined): string | undefined;
export function toIstIso(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return undefined;
  const shifted = new Date(time + IST_OFFSET_MINUTES * 60 * 1000);
  return `${shifted.toISOString().slice(0, 19)}+05:30`;
}
