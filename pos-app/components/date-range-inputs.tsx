"use client";

import { useEffect, useState } from "react";
import { Calendar, Check, RotateCcw } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { todayIsoDateInVenue } from "@/lib/venue-timezone";

export interface DateRangeInputsProps {
  from: string;
  to: string;
  onFromChange?: (value: string) => void;
  onToChange?: (value: string) => void;
  onApply?: (range: { from: string; to: string }) => void;
  className?: string;
}

/** From–to date inputs with draft state, quick presets, and confirmation button. */
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

  const applyPreset = (preset: "today" | "yesterday" | "last7" | "last30" | "thisMonth") => {
    const todayStr = todayIsoDateInVenue();
    const [yStr, mStr] = todayStr.split("-");
    const year = Number(yStr);
    const month = Number(mStr);

    let nextFrom = todayStr;
    let nextTo = todayStr;

    if (preset === "today") {
      nextFrom = todayStr;
      nextTo = todayStr;
    } else if (preset === "yesterday") {
      const yDate = new Date();
      yDate.setDate(yDate.getDate() - 1);
      nextFrom = todayIsoDateInVenue(yDate);
      nextTo = nextFrom;
    } else if (preset === "last7") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      nextFrom = todayIsoDateInVenue(d);
      nextTo = todayStr;
    } else if (preset === "last30") {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      nextFrom = todayIsoDateInVenue(d);
      nextTo = todayStr;
    } else if (preset === "thisMonth") {
      const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
      nextFrom = firstDay;
      nextTo = todayStr;
    }

    setDraftFrom(nextFrom);
    setDraftTo(nextTo);
    if (onApply) {
      onApply({ from: nextFrom, to: nextTo });
    }
    onFromChange?.(nextFrom);
    onToChange?.(nextTo);
  };

  const resetToToday = () => {
    applyPreset("today");
  };

  const okLabel = language === "vi" ? "Áp dụng" : language === "cs" ? "Použít" : "Apply";
  const todayLabel = language === "vi" ? "Hôm nay" : language === "cs" ? "Dnes" : "Today";
  const last7Label = language === "vi" ? "7 ngày" : language === "cs" ? "7 dní" : "7 days";
  const thisMonthLabel = language === "vi" ? "Tháng này" : language === "cs" ? "Tento měsíc" : "This month";

  return (
    <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/90 p-2 dark:border-stone-700/80 dark:bg-stone-900/70 ${className}`}>
      {/* Quick Presets */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <button
          type="button"
          onClick={() => applyPreset("today")}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700 shadow-xs hover:bg-gray-100 dark:border-stone-700 dark:bg-stone-800 dark:text-gray-200 dark:hover:bg-stone-700"
        >
          {todayLabel}
        </button>
        <button
          type="button"
          onClick={() => applyPreset("last7")}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700 shadow-xs hover:bg-gray-100 dark:border-stone-700 dark:bg-stone-800 dark:text-gray-200 dark:hover:bg-stone-700"
        >
          {last7Label}
        </button>
        <button
          type="button"
          onClick={() => applyPreset("thisMonth")}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700 shadow-xs hover:bg-gray-100 dark:border-stone-700 dark:bg-stone-800 dark:text-gray-200 dark:hover:bg-stone-700"
        >
          {thisMonthLabel}
        </button>
      </div>

      {/* Date Pickers in a single unified strip */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 dark:border-stone-700 dark:bg-stone-800">
        <Calendar className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
        <label className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
          <span className="sr-only sm:not-sr-only text-[11px] text-gray-500 dark:text-gray-400">{translate("dateFrom")}</span>
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
          <span className="sr-only sm:not-sr-only text-[11px] text-gray-500 dark:text-gray-400">{translate("dateTo")}</span>
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
            ? "bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-500/30 scale-105"
            : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 dark:border-stone-700 dark:bg-stone-800 dark:text-gray-200 dark:hover:bg-stone-700"
        }`}
        title="OK / Apply date range"
      >
        <Check className="h-3.5 w-3.5 shrink-0" />
        <span>{okLabel}</span>
      </button>

      {/* Reset button if not today */}
      {(from !== todayIsoDateInVenue() || to !== todayIsoDateInVenue()) && (
        <button
          type="button"
          onClick={resetToToday}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-stone-800 dark:hover:text-gray-200"
          title="Reset to today"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
