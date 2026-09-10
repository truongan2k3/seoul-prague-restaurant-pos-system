"use client";

import { useMemo } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { buildTimeSlotsForDate } from "@/lib/reservation-slots";
import type { AppSettings } from "@/lib/types";

function splitDateTimeLocal(value: string): { date: string; time: string } {
  if (!value || !value.includes("T")) {
    return { date: "", time: "18:00" };
  }
  const [date, rest] = value.split("T");
  const time = (rest ?? "18:00").slice(0, 5);
  return { date: date ?? "", time };
}

function joinDateTimeLocal(date: string, time: string): string {
  if (!date) return "";
  return `${date}T${time || "18:00"}`;
}

/** Split date + time controls (faster than datetime-local on POS tablets). */
export function ReservationDateTimeFields({
  value,
  onChange,
  settings,
  dateLabel,
  timeLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  settings: AppSettings;
  dateLabel: string;
  timeLabel: string;
}) {
  const { date, time } = splitDateTimeLocal(value);
  const slots = useMemo(() => {
    if (!date) return [] as string[];
    return buildTimeSlotsForDate(
      date,
      settings.reservationOperatingHours,
      settings.reservationTimeStep,
    );
  }, [date, settings.reservationOperatingHours, settings.reservationTimeStep]);

  const times =
    slots.length > 0
      ? slots
      : [
          "12:00",
          "12:30",
          "13:00",
          "17:00",
          "17:30",
          "18:00",
          "18:30",
          "19:00",
          "19:30",
          "20:00",
          "20:30",
          "21:00",
        ];
  const selectedTime = times.includes(time) ? time : times[0] ?? "18:00";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {dateLabel}
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => onChange(joinDateTimeLocal(e.target.value, selectedTime))}
          className="pos-input mt-1"
        />
      </label>
      <label className="block text-sm">
        <span className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {timeLabel}
        </span>
        <select
          value={selectedTime}
          onChange={(e) => onChange(joinDateTimeLocal(date, e.target.value))}
          className="pos-input mt-1"
        >
          {times.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
