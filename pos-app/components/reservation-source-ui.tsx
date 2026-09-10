"use client";

import { Globe, Phone, UserRound } from "lucide-react";
import type { VisitSource } from "@/lib/types";

export type StaffBookingSource = "phone_call" | "online";

export function normalizeDisplaySource(source: VisitSource): "phone_call" | "online" | "walk_in" {
  if (source === "walk_in") return "walk_in";
  if (source === "phone_call") return "phone_call";
  // Legacy `reservation` and explicit `online` both show as Online.
  return "online";
}

export function ReservationSourcePicker({
  value,
  onChange,
  phoneLabel,
  onlineLabel,
}: {
  value: StaffBookingSource;
  onChange: (next: StaffBookingSource) => void;
  phoneLabel: string;
  onlineLabel: string;
}) {
  const options: { id: StaffBookingSource; label: string; icon: typeof Phone }[] = [
    { id: "phone_call", label: phoneLabel, icon: Phone },
    { id: "online", label: onlineLabel, icon: Globe },
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
            <Icon className="h-4 w-4" aria-hidden />
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
  walkInLabel,
}: {
  source: VisitSource;
  phoneLabel: string;
  onlineLabel: string;
  walkInLabel: string;
}) {
  const kind = normalizeDisplaySource(source);
  if (kind === "walk_in") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <UserRound className="h-3 w-3" aria-hidden />
        {walkInLabel}
      </span>
    );
  }
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
