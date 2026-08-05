"use client";

export const PERCENT_PRESETS = [5, 10, 15, 20, 30, 50, 80, 100] as const;

interface PercentPresetButtonsProps {
  selected: number | null;
  onSelect: (percent: number) => void;
  activeClassName?: string;
  inactiveClassName?: string;
}

export function PercentPresetButtons({
  selected,
  onSelect,
  activeClassName = "bg-blue-600 text-white",
  inactiveClassName = "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
}: PercentPresetButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {PERCENT_PRESETS.map((pct) => (
        <button
          key={pct}
          type="button"
          onClick={() => onSelect(pct)}
          className={`min-w-[3rem] flex-1 rounded-lg py-2 text-xs font-medium ${
            selected === pct ? activeClassName : inactiveClassName
          }`}
        >
          {pct}%
        </button>
      ))}
    </div>
  );
}
