import type { WebsiteOpeningHour } from "@/lib/website/types";

const DAY_FULL: Record<WebsiteOpeningHour["day"], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DAY_ORDER: WebsiteOpeningHour["day"][] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** Single-line opening hours for Visit Us, e.g. "Monday – Sunday · 11:00 – 23:00". */
export function formatOpeningHoursOneLine(hours: WebsiteOpeningHour[]): string {
  const sorted = [...hours].sort(
    (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day),
  );
  const openDays = sorted.filter((row) => !row.closed);
  if (openDays.length === 0) return "Closed";

  const first = openDays[0];
  const last = openDays[openDays.length - 1];
  const sameHours = openDays.every(
    (row) => row.open === first.open && row.close === first.close,
  );

  const daySpan =
    openDays.length === 7
      ? "Monday – Sunday"
      : `${DAY_FULL[first.day]} – ${DAY_FULL[last.day]}`;

  if (sameHours) {
    const note = first.note?.trim();
    return note
      ? `${daySpan} · ${first.open} – ${first.close} · ${note}`
      : `${daySpan} · ${first.open} – ${first.close}`;
  }

  const earliest = [...openDays].map((r) => r.open).sort()[0];
  const latest = [...openDays].map((r) => r.close).sort().at(-1) ?? first.close;
  return `${daySpan} · ${earliest} – ${latest}`;
}
