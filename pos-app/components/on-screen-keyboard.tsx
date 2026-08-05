"use client";

import { ChevronDown, Delete } from "lucide-react";
import { useApp } from "@/contexts/app-context";

const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
] as const;

const ROW_COLS = [10, 10, 9, 7] as const;

interface OnScreenKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onHide: () => void;
}

export function OnScreenKeyboard({ value, onChange, onHide }: OnScreenKeyboardProps) {
  const { translate } = useApp();

  const append = (key: string) => onChange(value + key);
  const backspace = () => onChange(value.slice(0, -1));
  const clear = () => onChange("");

  return (
    <div className="shrink-0 border-t border-gray-200 bg-gray-100 px-1.5 py-2 sm:px-2 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5 sm:px-1">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-gray-500 dark:text-gray-400">
          {value || translate("searchMenu")}
        </p>
        <button
          type="button"
          onClick={onHide}
          className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-700 sm:min-h-[36px] sm:px-3 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          <ChevronDown className="h-4 w-4" />
          {translate("hideKeyboard")}
        </button>
      </div>

      <div className="space-y-1 sm:space-y-1.5">
        {ROWS.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-0.5 sm:gap-1.5"
            style={{ gridTemplateColumns: `repeat(${ROW_COLS[rowIndex]}, minmax(0, 1fr))` }}
          >
            {row.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => append(key)}
                className="min-h-[34px] min-w-0 rounded-md border border-gray-300 bg-white px-0 text-[11px] font-semibold uppercase leading-none text-gray-900 active:bg-gray-200 sm:min-h-[44px] sm:rounded-lg sm:text-base dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
              >
                {key}
              </button>
            ))}
          </div>
        ))}

        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-0.5 sm:gap-1.5">
          <button
            type="button"
            onClick={() => append(" ")}
            className="min-h-[34px] min-w-0 rounded-md border border-gray-300 bg-white text-[11px] font-semibold text-gray-900 active:bg-gray-200 sm:min-h-[44px] sm:rounded-lg sm:text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
          >
            {translate("keyboardSpace")}
          </button>
          <button
            type="button"
            onClick={backspace}
            aria-label={translate("keyboardBackspace")}
            className="inline-flex min-h-[34px] min-w-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-900 active:bg-gray-200 sm:min-h-[44px] sm:rounded-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
          >
            <Delete className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <button
            type="button"
            onClick={clear}
            className="min-h-[34px] min-w-0 rounded-md border border-gray-300 bg-white px-1 text-[10px] font-semibold text-gray-900 active:bg-gray-200 sm:min-h-[44px] sm:rounded-lg sm:px-2 sm:text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
          >
            {translate("keyboardClear")}
          </button>
        </div>
      </div>
    </div>
  );
}
