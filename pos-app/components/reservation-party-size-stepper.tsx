"use client";

import { Minus, Plus, Users } from "lucide-react";

/** Touch-friendly party size stepper for reservation forms. */
export function PartySizeStepper({
  value,
  onChange,
  min = 1,
  max = 50,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  const clamped = Math.min(max, Math.max(min, value));

  return (
    <div className="block text-sm">
      {label ? <span className="text-gray-500 dark:text-gray-400">{label}</span> : null}
      <div
        className={`flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-2 py-2 dark:border-gray-600 dark:bg-gray-900 ${
          label ? "mt-1" : ""
        }`}
      >
        <button
          type="button"
          aria-label="Decrease party size"
          disabled={clamped <= min}
          onClick={() => onChange(Math.max(min, clamped - 1))}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-800 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-100"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="flex min-w-[4.5rem] flex-col items-center">
          <Users className="h-4 w-4 text-gray-400" aria-hidden />
          <span className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {clamped}
          </span>
        </div>
        <button
          type="button"
          aria-label="Increase party size"
          disabled={clamped >= max}
          onClick={() => onChange(Math.min(max, clamped + 1))}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-800 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-100"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
