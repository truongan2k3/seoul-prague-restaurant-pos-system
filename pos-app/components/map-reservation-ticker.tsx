"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import {
  filterReservationsByPeriod,
  reservationStatusLabelKey,
} from "@/lib/reservation-analytics";
import type { ReservationRecord } from "@/lib/types";
import {
  fetchReservations,
  mapReservationsResponse,
  subscribeToReservationChanges,
} from "@/src/lib/reservation-actions";

const DEFAULT_INTERVAL_SEC = 6;
const MIN_INTERVAL_SEC = 2;
const MAX_INTERVAL_SEC = 30;

function clampTickerSeconds(value: number | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_SEC;
  return Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(n)));
}

function formatTime(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language === "cs" ? "cs-CZ" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusTone(status: ReservationRecord["status"]): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    case "confirmed":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
    case "late":
      return "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200";
    case "checked_in":
      return "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200";
    case "no_show":
      return "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200";
    case "cancelled":
      return "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    case "completed":
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
}

export function MapReservationTicker() {
  const { translate, language } = useApp();
  const { settings } = useSettings();
  const intervalMs = clampTickerSeconds(settings.mapReservationTickerSeconds) * 1000;

  const [rows, setRows] = useState<ReservationRecord[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const load = useCallback(async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const { data, error } = await fetchReservations(since);
    if (error || !data) return;
    const today = filterReservationsByPeriod(mapReservationsResponse(data), "today").sort(
      (a, b) => a.reservedAt.getTime() - b.reservedAt.getTime(),
    );
    setRows(today);
  }, []);

  useEffect(() => {
    void load();
    return subscribeToReservationChanges(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    setIndex(0);
  }, [rows.length]);

  useEffect(() => {
    if (rows.length <= 1) return;

    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = setInterval(() => {
      setVisible(false);
      fadeTimer = setTimeout(() => {
        setIndex((prev) => (prev + 1) % rows.length);
        setVisible(true);
      }, 280);
    }, intervalMs);

    return () => {
      clearInterval(tick);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, [intervalMs, rows.length]);

  const current = rows[index] ?? null;
  const emptyLabel = useMemo(() => translate("mapResTickerEmpty"), [translate]);

  return (
    <aside className="flex h-11 shrink-0 items-center gap-2 border-t border-gray-200 bg-white px-3 dark:border-gray-800 dark:bg-gray-900 sm:h-12 sm:gap-3 sm:px-4">
      <div className="flex shrink-0 items-center gap-1.5 text-gray-500 dark:text-gray-400">
        <CalendarClock className="h-3.5 w-3.5 text-red-500" />
        <span className="hidden text-[11px] font-semibold uppercase tracking-wide sm:inline">
          {translate("mapResTickerTitle")}
        </span>
        {rows.length > 0 && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {index + 1}/{rows.length}
          </span>
        )}
      </div>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {!current ? (
          <p className="truncate text-xs text-gray-400 dark:text-gray-500">{emptyLabel}</p>
        ) : (
          <div
            key={current.id + String(index)}
            className={`flex min-w-0 items-center gap-2 transition-all duration-300 ease-out sm:gap-3 ${
              visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
            }`}
          >
            <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {formatTime(current.reservedAt, language)}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone(current.status)}`}
            >
              {translate(reservationStatusLabelKey(current.status))}
            </span>
            <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {current.guestName}
              <span className="font-normal text-gray-500 dark:text-gray-400">
                {" "}
                · {current.partySize}
              </span>
            </span>
            <span className="hidden min-w-0 truncate text-xs text-gray-500 sm:inline dark:text-gray-400">
              {current.tableLabel
                ? `${translate("table")} ${current.tableLabel}`
                : translate("mapResTickerNoTable")}
              {current.bookingCode ? ` · ${current.bookingCode}` : ""}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
