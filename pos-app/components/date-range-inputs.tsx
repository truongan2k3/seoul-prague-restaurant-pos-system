"use client";

import { useApp } from "@/contexts/app-context";

interface DateRangeInputsProps {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

/** From–to date inputs for History / Summary custom period. */
export function DateRangeInputs({ from, to, onFromChange, onToChange }: DateRangeInputsProps) {
  const { translate } = useApp();

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
        {translate("dateFrom")}
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => onFromChange(event.target.value)}
          className="pos-input mt-1 block min-w-[10rem]"
        />
      </label>
      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
        {translate("dateTo")}
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => onToChange(event.target.value)}
          className="pos-input mt-1 block min-w-[10rem]"
        />
      </label>
    </div>
  );
}
