"use client";

import { useSyncExternalStore } from "react";

import { TIME_ZONE } from "@/lib/format/datetime";

/**
 * The masthead's dateline, written by the reader's browser.
 *
 * Every page is cached, and a date written into the cached page made every
 * page on the site different at midnight, to be stored all over again. Written
 * here instead, the cached page never changes with the calendar, and the date a
 * reader sees is always today's.
 *
 * The paper's day is India's day, wherever the reader is: the date is taken in
 * India Standard Time, not the browser's own zone.
 */

const subscribe = () => () => {};

/** Today in India as "2026-10-02", or null while rendering on the server. */
function useIndiaToday(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date()),
    () => null,
  );
}

export function LiveDateline() {
  const isoToday = useIndiaToday();
  if (!isoToday) return null;

  // Midday in India on that date, so the weekday cannot slip across midnight
  // whatever the browser's own zone.
  const day = new Date(`${isoToday}T12:00:00+05:30`);
  const long = day.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
  const short = day.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  });

  // The short form on a phone, where the same line also has to hold the
  // controls and the sign-in button.
  return (
    <time dateTime={isoToday}>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{long}</span>
    </time>
  );
}
