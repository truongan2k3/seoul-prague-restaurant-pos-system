"use client";

import { ChevronDown, Delete } from "lucide-react";
import { useApp } from "@/contexts/app-context";

const DIGIT_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
] as const;

interface OnScreenNumericKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onHide: () => void;
  allowDecimal?: boolean;
  previewLabel?: string;
}

export function OnScreenNumericKeyboard({
  value,
  onChange,
  onHide,
  allowDecimal = true,
  previewLabel,
}: OnScreenNumericKeyboardProps) {
  const { translate } = useApp();

  const append = (key: string) => {
    if (key === "." && (!allowDecimal || value.includes("."))) return;
    if (key === "." && value === "") {
      onChange("0.");
      return;
    }
    onChange(value + key);
  };

  const backspace = () => onChange(value.slice(0, -1));
  const clear = () => onChange("");

  return (
    <div className="shrink-0 rounded-xl border border-gray-200 bg-gray-100 px-1.5 py-2 sm:px-2 dark:border-gray-700 dark:bg-gray-900 [&:not(:first-child)]:mt-2">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5 sm:px-1">
        <p className="min-w-0 flex-1 truncate text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400">
          {value || previewLabel || "0"}
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
        {DIGIT_ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-3 gap-0.5 sm:gap-1.5">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => append(key)}
                className="min-h-[40px] min-w-0 rounded-md border border-gray-300 bg-white text-base font-semibold tabular-nums text-gray-900 active:bg-gray-200 sm:min-h-[44px] sm:rounded-lg sm:text-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
              >
                {key}
              </button>
            ))}
          </div>
        ))}

        <div className="grid grid-cols-3 gap-0.5 sm:gap-1.5">
          {allowDecimal ? (
            <button
              type="button"
              onClick={() => append(".")}
              className="min-h-[40px] min-w-0 rounded-md border border-gray-300 bg-white text-base font-semibold text-gray-900 active:bg-gray-200 sm:min-h-[44px] sm:rounded-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
            >
              .
            </button>
          ) : (
            <button
              type="button"
              onClick={clear}
              className="min-h-[40px] min-w-0 rounded-md border border-gray-300 bg-white px-1 text-[10px] font-semibold text-gray-900 active:bg-gray-200 sm:min-h-[44px] sm:rounded-lg sm:text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
            >
              {translate("keyboardClear")}
            </button>
          )}
          <button
            type="button"
            onClick={() => append("0")}
            className="min-h-[40px] min-w-0 rounded-md border border-gray-300 bg-white text-base font-semibold tabular-nums text-gray-900 active:bg-gray-200 sm:min-h-[44px] sm:rounded-lg sm:text-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
          >
            0
          </button>
          <button
            type="button"
            onClick={backspace}
            aria-label={translate("keyboardBackspace")}
            className="inline-flex min-h-[40px] min-w-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-900 active:bg-gray-200 sm:min-h-[44px] sm:rounded-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
          >
            <Delete className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {allowDecimal && (
          <button
            type="button"
            onClick={clear}
            className="min-h-[34px] w-full rounded-md border border-gray-300 bg-white text-xs font-semibold text-gray-900 active:bg-gray-200 sm:min-h-[40px] sm:rounded-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
          >
            {translate("keyboardClear")}
          </button>
        )}
      </div>
    </div>
  );
}
