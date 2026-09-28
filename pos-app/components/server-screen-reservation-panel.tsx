"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Users, X } from "lucide-react";
import {
  filterReservationsByPeriod,
  reservationStatusLabelKey,
  sortReservationsForDayList,
} from "@/lib/reservation-analytics";
import { t, type TranslationKey } from "@/lib/i18n/translations";
import type { LanguageCode, ReservationRecord } from "@/lib/types";
import { formatInVenueTz, todayIsoDateInVenue, venueDayRangeUtc } from "@/lib/venue-timezone";
import {
  fetchReservations,
  mapReservationsResponse,
  subscribeToReservationChanges,
} from "@/src/lib/reservation-actions";
import { reservationTableLabels } from "@/lib/reservation-tables";

type Props = {
  open: boolean;
  onClose: () => void;
  language: LanguageCode;
  title: string;
  emptyLabel: string;
};

function statusLabel(status: ReservationRecord["status"], language: LanguageCode): string {
  return t(language, reservationStatusLabelKey(status) as TranslationKey);
}

function receptionStatusTone(status: ReservationRecord["status"]): string {
  switch (status) {
    case "pending":
      return "bg-amber-400/12 text-amber-100/90 ring-1 ring-inset ring-amber-300/25";
    case "confirmed":
      return "bg-emerald-400/12 text-emerald-100/90 ring-1 ring-inset ring-emerald-300/25";
    case "checked_in":
      return "bg-[#C9A88B]/18 text-[#E8D5C4] ring-1 ring-inset ring-[#C9A88B]/35";
    case "late":
      return "bg-orange-400/15 text-orange-100 ring-1 ring-inset ring-orange-300/30";
    case "no_show":
      return "bg-rose-400/12 text-rose-100/90 ring-1 ring-inset ring-rose-300/25";
    case "cancelled":
      return "bg-white/[0.04] text-white/45 ring-1 ring-inset ring-white/10";
    case "completed":
      return "bg-white/[0.06] text-white/65 ring-1 ring-inset ring-white/12";
    default:
      return "bg-white/[0.05] text-white/55 ring-1 ring-inset ring-white/10";
  }
}

function receptionTableBadgeClass(status: ReservationRecord["status"]): string {
  if (status === "checked_in") {
    return "border-[#C9A88B]/45 bg-gradient-to-b from-[#C9A88B]/20 to-[#C9A88B]/05 text-[#F5EDE4] shadow-[0_0_24px_rgba(201,168,139,0.12)]";
  }
  if (status === "late") {
    return "border-orange-400/35 bg-gradient-to-b from-orange-400/15 to-orange-400/[0.04] text-orange-50";
  }
  return "border-white/15 bg-gradient-to-b from-white/[0.08] to-white/[0.02] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
}

/** Read-only today's reservations for Server Screen (no check-in / create). */
export function ServerScreenReservationPanel({
  open,
  onClose,
  language,
  title,
  emptyLabel,
}: Props) {
  const [rows, setRows] = useState<ReservationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = todayIsoDateInVenue();
      const { startIso } = venueDayRangeUtc(today);
      const { data, error: fetchError } = await fetchReservations(new Date(startIso));
      if (fetchError) {
        setError(fetchError.message);
        setRows([]);
      } else {
        const mapped = mapReservationsResponse(data);
        const todayRows = sortReservationsForDayList(
          filterReservationsByPeriod(mapped, "today").filter((row) => row.source !== "walk_in"),
        );
        setRows(todayRows);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reservations.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    return subscribeToReservationChanges({
      onChange: () => void load(),
    });
  }, [open, load]);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  return (
    <aside
      data-server-interactive
      className={`absolute inset-0 z-30 flex w-full flex-col bg-[#0B0B0C] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open ? "translate-x-0" : "-translate-x-full pointer-events-none"
      }`}
      aria-hidden={!open}
      aria-label={title}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#C9A88B]">
            {title}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-[#F5EDE4]">Today</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full border border-white/15 p-2.5 text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : error && rows.length === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-[#E8D5C4]/80">{error}</p>
        ) : rows.length === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-white/45">{emptyLabel}</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((row) => {
              const time = formatInVenueTz(row.reservedAt, language === "cs" ? "cs-CZ" : "en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: language === "en",
              });
              const labels = reservationTableLabels(row);
              const hasTable = labels.length > 0;
              return (
                <li
                  key={row.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3.5 sm:px-5 sm:py-4"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                        <p className="min-w-0 truncate text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">
                          {row.guestName}
                        </p>
                        <span
                          className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] sm:text-[11px] ${receptionStatusTone(row.status)}`}
                        >
                          {statusLabel(row.status, language)}
                        </span>
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-white/55">
                        <span className="tabular-nums tracking-wide">{time}</span>
                        <span className="text-white/20" aria-hidden>
                          ·
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 opacity-70" aria-hidden />
                          <span className="tabular-nums">{row.partySize}</span>
                        </span>
                      </p>
                    </div>

                    {hasTable ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        {labels.map((label) => (
                          <div
                            key={label}
                            className={`flex min-w-[3.75rem] flex-col items-center justify-center rounded-xl border px-2 py-2 sm:min-w-[4.5rem] sm:px-2.5 sm:py-2.5 ${receptionTableBadgeClass(row.status)}`}
                          >
                            <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-current/50 sm:text-[9px]">
                              Table
                            </span>
                            <span className="mt-0.5 text-[1.55rem] font-bold leading-none tracking-wide tabular-nums sm:text-[1.85rem]">
                              {label}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
