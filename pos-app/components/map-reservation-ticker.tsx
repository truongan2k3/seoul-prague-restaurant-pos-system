"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import {
  filterReservationsByPeriod,
  reservationStatusLabelKey,
  reservationStatusTone,
} from "@/lib/reservation-analytics";
import type { ReservationRecord, ReservationStatus } from "@/lib/types";
import {
  fetchReservations,
  mapReservationsResponse,
  subscribeToReservationChanges,
} from "@/src/lib/reservation-actions";

const DEFAULT_INTERVAL_SEC = 6;
const MIN_INTERVAL_SEC = 2;
const MAX_INTERVAL_SEC = 30;

/** Guests who have not arrived yet — hide after check-in / cancel / no-show / complete. */
const UPCOMING_STATUSES: ReservationStatus[] = ["pending", "confirmed", "late"];

const FADE_MS = 420;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function clampTickerSeconds(value: number | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_SEC;
  return Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(n)));
}

function formatTime(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language === "cs" ? "cs-CZ" : "en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function MapReservationTicker() {
  const { translate, language } = useApp();
  const { settings } = useSettings();
  const intervalMs = clampTickerSeconds(settings.mapReservationTickerSeconds) * 1000;

  const [rows, setRows] = useState<ReservationRecord[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const load = useCallback(async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const { data, error } = await fetchReservations(since);
    if (error || !data) return;
    const today = filterReservationsByPeriod(mapReservationsResponse(data), "today")
      .filter(
        (row) =>
          row.source === "reservation" && UPCOMING_STATUSES.includes(row.status),
      )
      .sort((a, b) => a.reservedAt.getTime() - b.reservedAt.getTime());
    setRows(today);
  }, []);

  useEffect(() => {
    void load();
    return subscribeToReservationChanges(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    setIndex((prev) => (rows.length === 0 ? 0 : prev % rows.length));
  }, [rows]);

  useEffect(() => {
    if (rows.length <= 1) {
      setPhase("in");
      return;
    }

    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = setInterval(() => {
      setPhase("out");
      fadeTimer = setTimeout(() => {
        const len = rowsRef.current.length;
        if (len > 0) {
          setIndex((prev) => (prev + 1) % len);
        }
        setPhase("in");
      }, FADE_MS);
    }, intervalMs);

    return () => {
      clearInterval(tick);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, [intervalMs, rows.length]);

  if (rows.length === 0) return null;

  const current = rows[index] ?? rows[0];
  if (!current) return null;

  const entering = phase === "in";

  return (
    <aside className="flex shrink-0 flex-col gap-1 border-t border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900 sm:h-14 sm:flex-row sm:items-center sm:gap-3.5 sm:px-5 sm:py-0">
      <div className="flex shrink-0 items-center gap-2 text-gray-500 dark:text-gray-400">
        <CalendarClock className="h-4 w-4 text-red-500" />
        <span className="text-[10px] font-semibold uppercase tracking-wide sm:text-xs">
          {translate("mapResTickerTitle")}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {index + 1}/{rows.length}
        </span>
      </div>

      <div className="relative min-h-[2.5rem] min-w-0 flex-1 overflow-hidden sm:min-h-[1.75rem]">
        <div
          key={current.id + String(index)}
          className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3.5"
          style={{
            transition: `opacity ${FADE_MS}ms ${EASE}, transform ${FADE_MS}ms ${EASE}`,
            opacity: entering ? 1 : 0,
            transform: entering ? "translateY(0)" : "translateY(10px)",
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-mono text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {formatTime(current.reservedAt, language)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 sm:text-[15px] dark:text-gray-100">
              {current.guestName}
              <span className="font-normal text-gray-500 dark:text-gray-400">
                {" "}
                · {current.partySize}
              </span>
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2 pl-[0.15rem] sm:pl-0">
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase sm:px-2.5 sm:text-[11px] ${reservationStatusTone(current.status)}`}
            >
              {translate(reservationStatusLabelKey(current.status))}
            </span>
            <span className="min-w-0 truncate text-xs text-gray-500 sm:text-sm dark:text-gray-400">
              {current.tableLabel
                ? `${translate("table")} ${current.tableLabel}`
                : translate("mapResTickerNoTable")}
              {current.bookingCode ? ` · ${current.bookingCode}` : ""}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
