/**
 * Date and time presentation.
 *
 * News readers need two different things from a timestamp: how fresh is this,
 * and when exactly was it. The front page wants the first, an article page
 * wants both, and a machine reading our structured data wants ISO 8601.
 */

const RELATIVE_CUTOFF_HOURS = 24;

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
  });
}

/** '9 September 2026 at 14:20' */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} at ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** '14:32' — used for live blog update stamps. */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
