import type { AppSettings } from "@/lib/types";

export const DEFAULT_RESERVATION_OPERATING_HOURS: AppSettings["reservationOperatingHours"] = {
  monday: { enabled: true, open: "11:00", close: "22:00" },
  tuesday: { enabled: true, open: "11:00", close: "22:00" },
  wednesday: { enabled: true, open: "11:00", close: "22:00" },
  thursday: { enabled: true, open: "11:00", close: "22:00" },
  friday: { enabled: true, open: "11:00", close: "23:00" },
  saturday: { enabled: true, open: "11:00", close: "23:00" },
  sunday: { enabled: true, open: "11:00", close: "22:00" },
};

export const WEEKDAY_KEYS: (keyof AppSettings["reservationOperatingHours"])[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

export function formatMinutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getWeekdayKey(date: Date): keyof AppSettings["reservationOperatingHours"] {
  const keys: (keyof AppSettings["reservationOperatingHours"])[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return keys[date.getDay()];
}

export function buildTimeSlotsForDay(
  dayConfig: AppSettings["reservationOperatingHours"][keyof AppSettings["reservationOperatingHours"]],
  stepMinutes: number,
): string[] {
  if (!dayConfig.enabled || stepMinutes <= 0) return [];

  const openMinutes = parseTimeToMinutes(dayConfig.open);
  const closeMinutes = parseTimeToMinutes(dayConfig.close);
  if (closeMinutes <= openMinutes) return [];

  const slots: string[] = [];
  for (let minute = openMinutes; minute <= closeMinutes; minute += stepMinutes) {
    if (minute > closeMinutes) break;
    slots.push(formatMinutesToTime(minute));
  }
  return slots;
}

export function buildTimeSlotsForDate(
  dateIso: string,
  operatingHours: AppSettings["reservationOperatingHours"],
  stepMinutes: number,
): string[] {
  const date = new Date(`${dateIso}T12:00:00`);
  const dayKey = getWeekdayKey(date);
  return buildTimeSlotsForDay(operatingHours[dayKey], stepMinutes);
}

export function filterPastTimeSlots(slots: string[], dateIso: string): string[] {
  const today = todayIsoDate();
  if (dateIso !== today) return slots;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return slots.filter((slot) => parseTimeToMinutes(slot) > nowMinutes);
}

export function todayIsoDate(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function formatOperatingHoursSummary(
  operatingHours: AppSettings["reservationOperatingHours"],
): string {
  const enabledDays = WEEKDAY_KEYS.filter((key) => operatingHours[key].enabled);
  if (enabledDays.length === 0) return "Reservations closed";

  const first = operatingHours[enabledDays[0]];
  const allSame = enabledDays.every(
    (key) =>
      operatingHours[key].open === first.open && operatingHours[key].close === first.close,
  );

  if (allSame && enabledDays.length === 7) {
    return `Monday – Sunday: ${first.open} – ${first.close}`;
  }

  return enabledDays
    .map((key) => {
      const day = operatingHours[key];
      return `${capitalize(key)}: ${day.open} – ${day.close}`;
    })
    .join("\n");
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export interface SlotCapacityRow {
  partySize: number;
  reservedAt: string;
  status: string;
}

export function countGuestsInSlot(
  reservations: SlotCapacityRow[],
  dateIso: string,
  time: string,
  stepMinutes: number,
): number {
  const slotStart = new Date(`${dateIso}T${time}:00`).getTime();
  const slotEnd = slotStart + stepMinutes * 60 * 1000;
  const activeStatuses = new Set(["pending", "confirmed", "checked_in", "late"]);

  return reservations.reduce((sum, row) => {
    if (!activeStatuses.has(row.status)) return sum;
    const reservedAt = new Date(row.reservedAt).getTime();
    if (reservedAt >= slotStart && reservedAt < slotEnd) {
      return sum + row.partySize;
    }
    return sum;
  }, 0);
}

export function filterSlotsByCapacity(
  slots: string[],
  reservations: SlotCapacityRow[],
  dateIso: string,
  stepMinutes: number,
  maxGuestsPerSlot: number,
  requestedGuests: number,
): string[] {
  return slots.filter((slot) => {
    const booked = countGuestsInSlot(reservations, dateIso, slot, stepMinutes);
    return booked + requestedGuests <= maxGuestsPerSlot;
  });
}
