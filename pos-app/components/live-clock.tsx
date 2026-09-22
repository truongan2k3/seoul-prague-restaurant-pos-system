"use client";

import { useEffect, useState } from "react";

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
};

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

interface LiveClockProps {
  className?: string;
  /** `header` = stacked date/time pill for desktop POS headers. */
  variant?: "plain" | "header";
}

export function LiveClock({ className, variant = "plain" }: LiveClockProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (variant === "header") {
    if (!now) {
      return (
        <time
          className={`hidden min-w-[7.5rem] sm:block ${className ?? ""}`}
          aria-hidden="true"
        >
          &nbsp;
        </time>
      );
    }

    return (
      <time
        dateTime={now.toISOString()}
        className={`hidden min-w-[7.5rem] flex-col items-end justify-center rounded-lg border border-gray-200/80 bg-gradient-to-b from-white to-gray-50 px-2.5 py-1 shadow-sm dark:border-zinc-700/80 dark:from-zinc-900 dark:to-zinc-950 sm:flex ${className ?? ""}`}
      >
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400 dark:text-zinc-500">
          {now.toLocaleDateString("en-GB", DATE_OPTS)}
        </span>
        <span className="text-sm font-semibold tabular-nums tracking-tight text-gray-900 dark:text-zinc-50">
          {now.toLocaleTimeString("en-GB", TIME_OPTS)}
        </span>
      </time>
    );
  }

  const resolvedClass =
    className ?? "text-sm font-medium tabular-nums text-gray-600 dark:text-gray-400";

  if (!now) {
    return (
      <time className={resolvedClass} aria-hidden="true">
        &nbsp;
      </time>
    );
  }

  return (
    <time dateTime={now.toISOString()} className={resolvedClass}>
      {now.toLocaleDateString("en-GB", DATE_OPTS)}
      {" · "}
      {now.toLocaleTimeString("en-GB", TIME_OPTS)}
    </time>
  );
}

export function formatElapsed(start: Date, nowMs: number = Date.now()): string {
  const totalSeconds = Math.max(0, Math.floor((nowMs - start.getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

interface ElapsedTimerProps {
  start: Date;
  className?: string;
}

/** Client-only elapsed timer — avoids SSR hydration mismatches from Date.now(). */
export function ElapsedTimer({ start, className }: ElapsedTimerProps) {
  const [elapsed, setElapsed] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setElapsed(formatElapsed(start));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [start]);

  return (
    <span className={className} aria-hidden={elapsed === null}>
      {elapsed ?? "--:--"}
    </span>
  );
}
