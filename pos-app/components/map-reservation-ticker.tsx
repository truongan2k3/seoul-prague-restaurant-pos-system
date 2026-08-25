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
    <aside className="flex w-full shrink-0 flex-col border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 xl:w-72 xl:border-l xl:border-t-0">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5 dark:border-gray-800">
        <CalendarClock className="h-4 w-4 text-red-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {translate("mapResTickerTitle")}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {rows.length > 0
              ? translate("mapResTickerCount").replace("{count}", String(rows.length))
              : emptyLabel}
          </p>
        </div>
      </div>

      <div className="relative flex min-h-[88px] flex-1 items-center overflow-hidden px-3 py-3 xl:min-h-[120px]">
        {!current ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">{emptyLabel}</p>
        ) : (
          <div
            key={current.id + String(index)}
            className={`w-full transition-all duration-300 ease-out ${
              visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {formatTime(current.reservedAt, language)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone(current.status)}`}
              >
                {translate(reservationStatusLabelKey(current.status))}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {current.guestName}
              <span className="font-normal text-gray-500 dark:text-gray-400">
                {" "}
                · {current.partySize} {translate("partySize").toLowerCase()}
              </span>
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {current.tableLabel
                ? `${translate("table")} ${current.tableLabel}`
                : translate("mapResTickerNoTable")}
              {current.bookingCode ? ` · ${current.bookingCode}` : ""}
            </p>
          </div>
        )}
      </div>

      {rows.length > 1 && (
        <div className="flex items-center justify-between gap-2 px-3 pb-2.5 text-[11px] text-gray-400 dark:text-gray-500">
          <span>
            {index + 1}/{rows.length}
          </span>
          <div className="flex max-w-[70%] flex-wrap justify-end gap-1">
            {rows.length <= 12
              ? rows.map((row, i) => (
                  <span
                    key={row.id}
                    className={`h-1.5 w-1.5 rounded-full transition ${
                      i === index ? "bg-red-500" : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  />
                ))
              : null}
          </div>
        </div>
      )}
    </aside>
  );
}
