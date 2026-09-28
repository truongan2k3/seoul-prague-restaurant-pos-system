"use client";

import { useEffect, useState } from "react";
import type { PrepTimeSample, PrepTimeStats } from "@/lib/prep-time-stats";
import {
  formatPrepDurationDetailed,
  formatPrepDurationShort,
} from "@/lib/prep-time-stats";

function StatHero({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "fast" | "slow" | "avg";
}) {
  const accentClass =
    accent === "fast"
      ? "text-emerald-300"
      : accent === "slow"
        ? "text-amber-300"
        : "text-[#F5EDE4]";

  return (
    <div className="min-w-0 text-center">
      <p className={`text-[clamp(1.75rem,4.5vw,3.25rem)] font-semibold tabular-nums leading-none tracking-tight ${accentClass}`}>
        {value}
      </p>
      <p className="mt-2 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-white/45 sm:text-xs">
        {label}
      </p>
    </div>
  );
}

function ItemRow({
  sample,
  minLabel,
  tone,
}: {
  sample: PrepTimeSample;
  minLabel: string;
  tone: "fast" | "slow";
}) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-base font-medium text-[#F5EDE4] sm:text-lg">{sample.name}</p>
        {sample.tableLabel ? (
          <p className="mt-0.5 text-xs tabular-nums text-white/35">
            {sample.tableLabel}
          </p>
        ) : null}
      </div>
      <span
        className={`shrink-0 text-base font-semibold tabular-nums sm:text-lg ${
          tone === "fast" ? "text-emerald-300/90" : "text-amber-300/90"
        }`}
      >
        {formatPrepDurationShort(sample.durationMs, minLabel)}
      </span>
    </li>
  );
}

export function ServerScreenPrepStatsPanel({
  stats,
  loading,
  visible,
  fadingOut,
  title,
  averageLabel,
  fastestLabel,
  slowestLabel,
  fastestItemsLabel,
  slowestItemsLabel,
  emptyLabel,
  sampleCountLabel,
  minLabel,
}: {
  stats: PrepTimeStats;
  loading: boolean;
  visible: boolean;
  fadingOut: boolean;
  title: string;
  averageLabel: string;
  fastestLabel: string;
  slowestLabel: string;
  fastestItemsLabel: string;
  slowestItemsLabel: string;
  emptyLabel: string;
  sampleCountLabel: string;
  minLabel: string;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!visible) {
      setEntered(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [visible]);

  if (!visible && !fadingOut) return null;

  const showContent = entered && !fadingOut;
  const avg =
    stats.averageMs != null ? formatPrepDurationDetailed(stats.averageMs, minLabel) : "—";
  const fastest =
    stats.fastest != null ? formatPrepDurationShort(stats.fastest.durationMs, minLabel) : "—";
  const slowest =
    stats.slowest != null ? formatPrepDurationShort(stats.slowest.durationMs, minLabel) : "—";

  return (
    <div
      className={`absolute inset-0 z-10 flex flex-col overflow-hidden bg-[#0B0B0C]/96 backdrop-blur-[2px] transition-opacity duration-700 ease-out ${
        showContent ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden={!showContent}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(232,213,196,0.08),transparent_55%)] transition-opacity duration-1000 ${
          showContent ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        className={`relative flex min-h-0 flex-1 flex-col px-5 py-6 transition-all duration-700 ease-out sm:px-8 sm:py-8 ${
          showContent ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        <header className="shrink-0 text-center">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-[#E8D5C4]/75 sm:text-xs">
            {title}
          </p>
          {!loading && stats.sampleCount > 0 ? (
            <p className="mt-2 text-xs tabular-nums text-white/30">
              {sampleCountLabel.replace("{count}", String(stats.sampleCount))}
            </p>
          ) : null}
        </header>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[#E8D5C4]" />
          </div>
        ) : stats.sampleCount === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="max-w-sm text-center text-base text-white/40">{emptyLabel}</p>
          </div>
        ) : (
          <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-8 pt-8 sm:gap-10 sm:pt-10">
            <div className="grid shrink-0 grid-cols-3 gap-3 sm:gap-8">
              <StatHero label={averageLabel} value={avg} accent="avg" />
              <StatHero label={fastestLabel} value={fastest} accent="fast" />
              <StatHero label={slowestLabel} value={slowest} accent="slow" />
            </div>

            <div className="grid min-h-0 flex-1 gap-6 overflow-hidden md:grid-cols-2 md:gap-10">
              <section className="min-h-0 overflow-y-auto overscroll-contain">
                <h3 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-emerald-300/70 sm:text-xs">
                  {fastestItemsLabel}
                </h3>
                <ul>
                  {stats.fastestItems.map((sample) => (
                    <ItemRow key={`fast-${sample.id}`} sample={sample} minLabel={minLabel} tone="fast" />
                  ))}
                </ul>
              </section>
              <section className="min-h-0 overflow-y-auto overscroll-contain">
                <h3 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-amber-300/70 sm:text-xs">
                  {slowestItemsLabel}
                </h3>
                <ul>
                  {stats.slowestItems.map((sample) => (
                    <ItemRow key={`slow-${sample.id}`} sample={sample} minLabel={minLabel} tone="slow" />
                  ))}
                </ul>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
