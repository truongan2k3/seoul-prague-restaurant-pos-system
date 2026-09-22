"use client";

import { Globe, Phone } from "lucide-react";
import type { VisitSource } from "@/lib/types";

/** Sources staff can set when creating a booking in POS. */
export type StaffBookingSource = "reservation" | "phone_call";

/**
 * How to present a source badge.
 * - `null` = in-house / POS booking — no mark
 * - phone_call / online = show badge
 */
export function normalizeDisplaySource(
  source: VisitSource,
): "phone_call" | "online" | null {
  if (source === "phone_call") return "phone_call";
  if (source === "online") return "online";
  // `reservation` (and legacy walk_in if any) → no badge
  return null;
}

export function ReservationSourcePicker({
  value,
  onChange,
  posLabel,
  phoneLabel,
}: {
  value: StaffBookingSource;
  onChange: (next: StaffBookingSource) => void;
  posLabel: string;
  phoneLabel: string;
}) {
  const options: { id: StaffBookingSource; label: string; icon: typeof Phone | null }[] = [
    { id: "reservation", label: posLabel, icon: null },
    { id: "phone_call", label: phoneLabel, icon: Phone },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(({ id, label, icon: Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
              active
                ? "border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-100"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
            }`}
          >
            {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function ReservationSourceBadge({
  source,
  phoneLabel,
  onlineLabel,
}: {
  source: VisitSource;
  phoneLabel: string;
  onlineLabel: string;
}) {
  const kind = normalizeDisplaySource(source);
  if (!kind) return null;
  if (kind === "phone_call") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-200">
        <Phone className="h-3 w-3" aria-hidden />
        {phoneLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
      <Globe className="h-3 w-3" aria-hidden />
      {onlineLabel}
    </span>
  );
}
