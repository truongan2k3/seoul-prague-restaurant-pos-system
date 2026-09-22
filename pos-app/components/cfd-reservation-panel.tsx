"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Users, X } from "lucide-react";
import {
  canCheckIn,
  filterReservationsByPeriod,
  reservationStatusLabelKey,
  reservationStatusTone,
  sortReservationsForDayList,
} from "@/lib/reservation-analytics";
import type { CfdWelcomePayload } from "@/lib/cfd-display";
import { sendCfdEvent } from "@/lib/cfd-display";
import { t, type TranslationKey } from "@/lib/i18n/translations";
import type { LanguageCode, ReservationRecord } from "@/lib/types";
import { formatInVenueTz, todayIsoDateInVenue, venueDayRangeUtc } from "@/lib/venue-timezone";
import { fetchGuestVisitProfile } from "@/src/lib/guest-history-actions";
import {
  checkInReservation,
  checkInReservationWithTable,
  fetchReservations,
  mapReservationsResponse,
  subscribeToReservationChanges,
} from "@/src/lib/reservation-actions";

type Props = {
  open: boolean;
  onClose: () => void;
  language: LanguageCode;
  onWelcome: (payload: CfdWelcomePayload) => void;
};

function statusLabel(status: ReservationRecord["status"], language: LanguageCode): string {
  return t(language, reservationStatusLabelKey(status) as TranslationKey);
}

export function CfdReservationPanel({ open, onClose, language, onWelcome }: Props) {
  const [rows, setRows] = useState<ReservationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const checkInLockRef = useRef(false);
  const welcomedIdsRef = useRef<Set<string>>(new Set());

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
    const unsub = subscribeToReservationChanges({
      onChange: () => void load(),
    });
    return unsub;
  }, [open, load]);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setError(null);
    }
  }, [open]);

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );
  const canCheckInSelected = selected ? canCheckIn(selected.status) : false;

  const handleCheckIn = useCallback(async () => {
    if (!selected || !canCheckIn(selected.status) || checkInLockRef.current) return;
    checkInLockRef.current = true;
    setBusyId(selected.id);
    setError(null);

    try {
      const { data: profile } = await fetchGuestVisitProfile({
        email: selected.guestEmail,
        phone: selected.guestPhone,
        excludeReservationId: selected.id,
        beforeAt: selected.reservedAt,
      });

      let result: { error: Error | null };
      if (selected.tableId) {
        result = await checkInReservationWithTable(selected.id, selected.tableId, {
          allowOccupied: true,
        });
      } else {
        result = await checkInReservation(selected.id);
      }

      if (result.error) {
        setError(result.error instanceof Error ? result.error.message : String(result.error));
        return;
      }

      welcomedIdsRef.current.add(selected.id);
      const payload: CfdWelcomePayload = {
        reservationId: selected.id,
        guestName: selected.guestName,
        isReturning: profile.isReturning,
        tableLabel: selected.tableLabel ?? null,
      };
      onClose();
      onWelcome(payload);
      void sendCfdEvent("GUEST_WELCOME", payload);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed.");
    } finally {
      setBusyId(null);
      checkInLockRef.current = false;
    }
  }, [selected, onClose, onWelcome, load]);

  return (
    <aside
      className={`absolute inset-y-0 left-0 z-40 flex w-[min(100%,26rem)] flex-col border-r border-white/10 bg-[#0B0B0C]/97 shadow-[20px_0_60px_rgba(0,0,0,0.55)] backdrop-blur-md transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open ? "translate-x-0" : "-translate-x-full pointer-events-none"
      }`}
      aria-hidden={!open}
      aria-label="Today's reservations"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#C9A88B]">
            Reception
          </p>
          <h2 className="landing-serif mt-1 text-2xl text-[#F5EDE4]">Today</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reservations"
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
          <p className="px-2 py-10 text-center text-sm text-white/45">No reservations today.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const active = row.id === selectedId;
              const time = formatInVenueTz(row.reservedAt, language === "cs" ? "cs-CZ" : "en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: language === "en",
              });
              const tableText = row.tableLabel?.trim()
                ? `Table ${row.tableLabel}`
                : "Table: Unassigned";
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full rounded-none border px-4 py-3.5 text-left transition ${
                      active
                        ? "border-[#C9A88B]/55 bg-[#8B1E2D]/25"
                        : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-white">{row.guestName}</p>
                        <p className="mt-1 text-sm tabular-nums text-white/60">{time}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${reservationStatusTone(row.status)}`}
                      >
                        {statusLabel(row.status, language)}
                      </span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {row.partySize}
                      </span>
                      <span
                        className={
                          row.tableLabel?.trim() ? "text-[#C9A88B]/90" : "text-amber-200/80"
                        }
                      >
                        {tableText}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#0B0B0C]/95 p-4">
        {error ? <p className="mb-3 text-center text-xs text-amber-200/90">{error}</p> : null}
        <button
          type="button"
          disabled={!canCheckInSelected || busyId != null}
          onClick={() => void handleCheckIn()}
          className="flex w-full items-center justify-center gap-2 bg-[#8B1E2D] px-6 py-5 text-lg font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#A02435] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busyId ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          Check-in
        </button>
        <p className="mt-2 text-center text-[11px] text-white/35">
          {canCheckInSelected
            ? selected?.tableLabel
              ? `Seats at ${selected.tableLabel}`
              : "Will check in without a table"
            : "Select a confirmed or late reservation"}
        </p>
      </div>
    </aside>
  );
}
