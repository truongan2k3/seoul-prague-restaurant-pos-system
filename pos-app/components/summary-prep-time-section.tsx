"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DateRangeInputs } from "@/components/date-range-inputs";
import { useApp } from "@/contexts/app-context";
import { todayIsoDateInVenue, venueDayRangeUtc } from "@/lib/venue-timezone";
import {
  computePrepTimeStats,
  emptyPrepTimeStats,
  formatPrepDurationDetailed,
  formatPrepDurationShort,
  formatVenueDateLabel,
  shiftVenueDateIso,
  type PrepTimeSample,
  type PrepTimeStats,
} from "@/lib/prep-time-stats";
import { filterButtonClass } from "@/lib/theme-classes";
import { fetchPrepTimeSamples } from "@/src/lib/supabase-data";

type PrepPeriodMode = "day" | "range";

function PrepStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-3xl">
        {value}
      </p>
      {hint ? <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
    </div>
  );
}

function PrepItemList({
  title,
  items,
  minLabel,
  emptyLabel,
  tone,
}: {
  title: string;
  items: PrepTimeSample[];
  minLabel: string;
  emptyLabel: string;
  tone: "fast" | "slow";
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((sample) => (
            <li
              key={`${tone}-${sample.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {sample.name}
                </p>
                {sample.tableLabel ? (
                  <p className="mt-0.5 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {sample.tableLabel}
                  </p>
                ) : null}
              </div>
              <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${
                  tone === "fast"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-amber-700 dark:text-amber-300"
                }`}
              >
                {formatPrepDurationShort(sample.durationMs, minLabel)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SummaryPrepTimeSection() {
  const { translate, language } = useApp();
  const todayIso = todayIsoDateInVenue();
  const [mode, setMode] = useState<PrepPeriodMode>("day");
  const [dayIso, setDayIso] = useState(todayIso);
  const [rangeFrom, setRangeFrom] = useState(todayIso);
  const [rangeTo, setRangeTo] = useState(todayIso);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<PrepTimeStats>(() => emptyPrepTimeStats());

  const activeBounds = useMemo(() => {
    if (mode === "day") return venueDayRangeUtc(dayIso);
    const from = rangeFrom <= rangeTo ? rangeFrom : rangeTo;
    const to = rangeFrom <= rangeTo ? rangeTo : rangeFrom;
    const start = venueDayRangeUtc(from).startIso;
    const endExclusiveIso = venueDayRangeUtc(to).endExclusiveIso;
    return { startIso: start, endExclusiveIso };
  }, [mode, dayIso, rangeFrom, rangeTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await fetchPrepTimeSamples({
        startIso: activeBounds.startIso,
        endExclusiveIso: activeBounds.endExclusiveIso,
      });
      if (error) {
        console.warn("[SummaryPrepStats]", error.message);
        setStats(emptyPrepTimeStats());
        return;
      }
      setStats(computePrepTimeStats(data));
    } finally {
      setLoading(false);
    }
  }, [activeBounds.endExclusiveIso, activeBounds.startIso]);

  useEffect(() => {
    void load();
  }, [load]);

  const minLabel = translate("serverScreenMin");
  const canGoNext = dayIso < todayIso;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {translate("prepStatsSummaryTitle")}
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {translate("prepStatsSummaryHint")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("day")}
            className={filterButtonClass(mode === "day")}
          >
            {translate("prepStatsSingleDay")}
          </button>
          <button
            type="button"
            onClick={() => setMode("range")}
            className={filterButtonClass(mode === "range")}
          >
            {translate("prepStatsDateRange")}
          </button>
        </div>
      </div>

      {mode === "day" ? (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label={translate("prepStatsPrevDay")}
            onClick={() => setDayIso((prev: string) => shiftVenueDateIso(prev, -1))}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="min-w-[12rem] text-center text-sm font-semibold text-gray-900 dark:text-gray-100 sm:min-w-[16rem] sm:text-base">
            {formatVenueDateLabel(dayIso, language)}
          </p>
          <button
            type="button"
            aria-label={translate("prepStatsNextDay")}
            disabled={!canGoNext}
            onClick={() => {
              if (!canGoNext) return;
              setDayIso((prev: string) => {
                const next = shiftVenueDateIso(prev, 1);
                return next > todayIso ? todayIso : next;
              });
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <DateRangeInputs
          from={rangeFrom}
          to={rangeTo}
          onFromChange={setRangeFrom}
          onToChange={(value) => setRangeTo(value > todayIso ? todayIso : value)}
        />
      )}

      {loading ? (
        <div className="mt-6 flex justify-center py-10">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-gray-700 dark:border-gray-700 dark:border-t-gray-200" />
        </div>
      ) : stats.sampleCount === 0 ? (
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">{translate("prepStatsNoData")}</p>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PrepStatCard
              label={translate("prepStatsAverage")}
              value={
                stats.averageMs != null
                  ? formatPrepDurationDetailed(stats.averageMs, minLabel)
                  : "—"
              }
            />
            <PrepStatCard
              label={translate("prepStatsFastest")}
              value={
                stats.fastest
                  ? formatPrepDurationShort(stats.fastest.durationMs, minLabel)
                  : "—"
              }
              hint={stats.fastest?.name}
            />
            <PrepStatCard
              label={translate("prepStatsSlowest")}
              value={
                stats.slowest
                  ? formatPrepDurationShort(stats.slowest.durationMs, minLabel)
                  : "—"
              }
              hint={stats.slowest?.name}
            />
            <PrepStatCard
              label={translate("prepStatsCompletedItems")}
              value={String(stats.sampleCount)}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <PrepItemList
              title={translate("prepStatsFastestItems")}
              items={stats.fastestItems}
              minLabel={minLabel}
              emptyLabel={translate("prepStatsNoData")}
              tone="fast"
            />
            <PrepItemList
              title={translate("prepStatsSlowestItems")}
              items={stats.slowestItems}
              minLabel={minLabel}
              emptyLabel={translate("prepStatsNoData")}
              tone="slow"
            />
          </div>
        </div>
      )}
    </section>
  );
}
