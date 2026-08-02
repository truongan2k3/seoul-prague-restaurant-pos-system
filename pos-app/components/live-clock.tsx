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

export function LiveClock({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

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
  const totalSeconds = Math.floor((nowMs - start.getTime()) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
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
