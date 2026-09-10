/** Restaurant wall-clock timezone (Czech Republic). */
export const VENUE_TIMEZONE = "Europe/Prague";

type VenueParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};

function venueParts(date: Date): VenueParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: VENUE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    weekday: bag.weekday ?? "",
  };
}

/**
 * Interpret YYYY-MM-DD + HH:mm as Europe/Prague wall clock → absolute UTC Date.
 * Fixes guest bookings that were previously stored as UTC-naive (showing +2h in Prague).
 */
export function venueWallTimeToUtc(dateIso: string, timeHHmm: string): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeHHmm.trim());
  if (!dateMatch || !timeMatch) {
    return new Date(NaN);
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  // Iterate: guess UTC instant, read Prague wall time, adjust until it matches.
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const parts = venueParts(new Date(utcMs));
    const asUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const desiredMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    const diff = desiredMs - asUtcMs;
    utcMs += diff;
    if (diff === 0) break;
  }
  return new Date(utcMs);
}

/** YYYY-MM-DD for "today" in Europe/Prague. */
export function todayIsoDateInVenue(now = new Date()): string {
  const parts = venueParts(now);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** HH:mm wall clock in Europe/Prague. */
export function formatVenueTimeHHmm(value: Date | string): string {
  const parts = venueParts(new Date(value));
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/** Split an absolute instant into venue wall-clock date + time (for edit forms). */
export function splitVenueWallTime(value: Date | string): { date: string; time: string } {
  const parts = venueParts(new Date(value));
  return {
    date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}

export function formatInVenueTz(
  value: Date | string,
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: VENUE_TIMEZONE,
    ...options,
  }).format(new Date(value));
}

/** Inclusive start / exclusive end ISO bounds for a venue calendar day. */
export function venueDayRangeUtc(dateIso: string): { startIso: string; endExclusiveIso: string } {
  const start = venueWallTimeToUtc(dateIso, "00:00");
  const [y, m, d] = dateIso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextIso = [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
  const endExclusive = venueWallTimeToUtc(nextIso, "00:00");
  return { startIso: start.toISOString(), endExclusiveIso: endExclusive.toISOString() };
}

const WEEKDAY_FROM_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Sunday=0 … Saturday=6 in Europe/Prague for a calendar date. */
export function venueWeekdayIndex(dateIso: string): number {
  const noon = venueWallTimeToUtc(dateIso, "12:00");
  const short = venueParts(noon).weekday;
  return WEEKDAY_FROM_SHORT[short] ?? 0;
}

export function minutesNowInVenue(now = new Date()): number {
  const parts = venueParts(now);
  return parts.hour * 60 + parts.minute;
}
