"use client";

import { ReservationTimePicker } from "@/components/reservation-time-picker";
import { CalendarDays, Clock } from "lucide-react";
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
  const selectedTime = time || "18:00";

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
      <div className="block text-sm">
        <span className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {timeLabel}
        </span>
        <ReservationTimePicker value={selectedTime} onChange={(next) => onChange(joinDateTimeLocal(date, next))} label={timeLabel} />
      </div>
    </div>
  );
}
