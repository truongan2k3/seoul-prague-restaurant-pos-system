"use client";

import { useEffect, useState } from "react";
import { Calendar, Check } from "lucide-react";
import { useApp } from "@/contexts/app-context";

export interface DateRangeInputsProps {
  from: string;
  to: string;
  onFromChange?: (value: string) => void;
  onToChange?: (value: string) => void;
  onApply?: (range: { from: string; to: string }) => void;
  className?: string;
}

/** Clean, unified From–To date picker with confirmation button. */
export function DateRangeInputs({
  from,
  to,
  onFromChange,
  onToChange,
  onApply,
  className = "",
}: DateRangeInputsProps) {
  const { translate, language } = useApp();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  // Sync draft with incoming props if props change from outside
  useEffect(() => {
    setDraftFrom(from);
  }, [from]);

  useEffect(() => {
    setDraftTo(to);
  }, [to]);

  const isDirty = draftFrom !== from || draftTo !== to;

  const handleApply = () => {
    let finalFrom = draftFrom;
    let finalTo = draftTo;
    if (finalFrom && finalTo && finalFrom > finalTo) {
      const temp = finalFrom;
      finalFrom = finalTo;
      finalTo = temp;
      setDraftFrom(finalFrom);
      setDraftTo(finalTo);
    }
    if (onApply) {
      onApply({ from: finalFrom, to: finalTo });
    }
    onFromChange?.(finalFrom);
    onToChange?.(finalTo);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleApply();
    }
  };

  const okLabel = language === "vi" ? "Áp dụng" : language === "cs" ? "Použít" : "Apply";

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white/70 p-1.5 dark:border-stone-700/80 dark:bg-stone-900/60 shadow-xs ${className}`}>
      {/* Date Pickers in a single unified strip */}
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 dark:border-stone-700 dark:bg-stone-800 shadow-2xs">
        <Calendar className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
        <label className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
          <span className="text-[11px] text-gray-400 dark:text-gray-500 font-normal">{translate("dateFrom")}</span>
          <input
            type="date"
            value={draftFrom}
            max={draftTo || undefined}
            onChange={(e) => setDraftFrom(e.target.value)}
            onKeyDown={handleKeyDown}
            className="rounded border-0 bg-transparent px-1 py-0.5 text-xs font-semibold text-gray-900 focus:ring-0 dark:text-gray-100"
          />
        </label>
        <span className="text-xs font-bold text-gray-400 dark:text-gray-500">→</span>
        <label className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
          <span className="text-[11px] text-gray-400 dark:text-gray-500 font-normal">{translate("dateTo")}</span>
          <input
            type="date"
            value={draftTo}
            min={draftFrom || undefined}
            onChange={(e) => setDraftTo(e.target.value)}
            onKeyDown={handleKeyDown}
            className="rounded border-0 bg-transparent px-1 py-0.5 text-xs font-semibold text-gray-900 focus:ring-0 dark:text-gray-100"
          />
        </label>
      </div>

      {/* Apply / OK Button */}
      <button
        type="button"
        onClick={handleApply}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all shadow-xs ${
          isDirty
            ? "bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-500/30 scale-102"
            : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 dark:border-stone-700 dark:bg-stone-800 dark:text-gray-200 dark:hover:bg-stone-700"
        }`}
        title="OK / Apply date range"
      >
        <Check className="h-3.5 w-3.5 shrink-0" />
        <span>{okLabel}</span>
      </button>
    </div>
  );
}
