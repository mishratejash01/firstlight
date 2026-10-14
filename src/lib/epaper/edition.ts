/**
 * The e-paper's calendar.
 *
 * One edition a day, dated the morning it comes out. The edition dated
 * 15 October holds every story published from 05:00 IST on 14 October up to,
 * but not including, 05:00 IST on 15 October, and appears at that 05:00. It is
 * a morning paper: what happened yesterday, ready with the first tea.
 *
 * Everything is worked out in India Standard Time, which has no daylight
 * saving, so a fixed +05:30 offset is exact. The server's own timezone (the
 * VPS runs on UTC) never enters into it.
 */

/** The hour, IST, at which one edition closes and the next is published. */
export const EDITION_HOUR_IST = 5;

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The moment an edition closes and comes out: 05:00 IST on its date. */
function closesAt(date: string): number {
  const hour = String(EDITION_HOUR_IST).padStart(2, "0");
  return Date.parse(`${date}T${hour}:00:00+05:30`);
}

/** A YYYY-MM-DD that names a real calendar day. */
export function isEditionDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** The newest edition out at `now`: today's after 05:00 IST, yesterday's before. */
export function latestEditionDate(now: number = Date.now()): string {
  const ist = new Date(now + IST_OFFSET_MS);
  if (ist.getUTCHours() < EDITION_HOUR_IST) ist.setUTCDate(ist.getUTCDate() - 1);
  return ist.toISOString().slice(0, 10);
}

/** Whether the edition for `date` has come out by `now`. */
export function isReleased(date: string, now: number = Date.now()): boolean {
  return closesAt(date) <= now;
}

/** The stories an edition holds: published at or after `start` and before `end`. */
export function editionWindow(date: string): { start: string; end: string } {
  const end = closesAt(date);
  return {
    start: new Date(end - DAY_MS).toISOString(),
    end: new Date(end).toISOString(),
  };
}

/** The date `days` away from `date`, for the previous and next editions. */
export function shiftDate(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** "Thursday, 15 October 2026". */
export function formatEditionDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** "Wednesday 14 October": a day named without the year, for the window line. */
function dayName(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
    .format(new Date(`${date}T12:00:00Z`))
    .replace(",", "");
}

/** "News from 5 am Wednesday 14 October to 5 am Thursday 15 October". */
export function windowLabel(date: string): string {
  return `News from ${EDITION_HOUR_IST} am ${dayName(shiftDate(date, -1))} to ${EDITION_HOUR_IST} am ${dayName(date)}`;
}
