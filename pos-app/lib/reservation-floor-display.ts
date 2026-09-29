import { venueDayRangeUtc } from "@/lib/venue-timezone";

/** Floor map assigned-table line, e.g. `22:00 Sean Paul - 5p`. */
export function formatFloorTableAssignmentLabel(input: {
  reservedAt: Date;
  guestName: string;
  partySize: number;
  language?: string;
}): string {
  const lang = input.language ?? "en";
  const time = new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang === "cs" ? "cs-CZ" : "en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(input.reservedAt);
  const name = input.guestName.trim() || "—";
  const guests = Math.max(1, input.partySize);
  return `${time} ${name} - ${guests}p`;
}

export function reservationOnVenueDateIso(reservedAt: Date, dateIso: string): boolean {
  const { startIso, endExclusiveIso } = venueDayRangeUtc(dateIso);
  const t = reservedAt.getTime();
  return t >= new Date(startIso).getTime() && t < new Date(endExclusiveIso).getTime();
}
