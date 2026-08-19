"use client";

export const PERCENT_PRESETS = [5, 10, 15, 20, 30, 50, 80, 100] as const;
export const CHECKOUT_PERCENT_PRESETS = [5, 10, 15, 20, 30, 50] as const;

interface PercentPresetButtonsProps {
  selected: number | null;
  onSelect: (percent: number) => void;
  activeClassName?: string;
  inactiveClassName?: string;
  presets?: readonly number[];
}

export function PercentPresetButtons({
  selected,
  onSelect,
  activeClassName = "bg-blue-600 text-white",
  inactiveClassName = "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  presets = PERCENT_PRESETS,
}: PercentPresetButtonsProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {presets.map((pct) => (
        <button
          key={pct}
          type="button"
          onClick={() => onSelect(pct)}
          className={`min-h-[44px] rounded-lg text-sm font-semibold sm:min-h-[48px] sm:text-base ${
            selected === pct ? activeClassName : inactiveClassName
          }`}
        >
          {pct}%
        </button>
      ))}
    </div>
  );
}
