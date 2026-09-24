"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Users, X } from "lucide-react";
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
import type { LanguageCode, ReservationRecord, RestaurantTable } from "@/lib/types";
import { formatInVenueTz, todayIsoDateInVenue, venueDayRangeUtc } from "@/lib/venue-timezone";
import type { WebsiteContent } from "@/lib/website/types";
import { ReservationBookingView } from "@/components/reservation-booking-view";
import { ReservationTableSelect, isOccupiedTable } from "@/components/reservation-table-select";
import { fetchGuestVisitProfile } from "@/src/lib/guest-history-actions";
import {
  checkInReservationWithTable,
  fetchReservations,
  mapReservationsResponse,
  subscribeToReservationChanges,
} from "@/src/lib/reservation-actions";
import { fetchTableSummaries, mapTablesResponse } from "@/src/lib/supabase-data";

type Props = {
  open: boolean;
  onClose: () => void;
  language: LanguageCode;
  onWelcome: (payload: CfdWelcomePayload) => void;
  website?: WebsiteContent;
};

function statusLabel(status: ReservationRecord["status"], language: LanguageCode): string {
  return t(language, reservationStatusLabelKey(status) as TranslationKey);
}

export function CfdReservationPanel({ open, onClose, language, onWelcome, website }: Props) {
  const [rows, setRows] = useState<ReservationRecord[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [checkInTableId, setCheckInTableId] = useState("");
  const checkInLockRef = useRef(false);
  const welcomedIdsRef = useRef<Set<string>>(new Set());

  const translate = useCallback(
    (key: TranslationKey) => t(language, key),
    [language],
  );

  const loadTables = useCallback(async () => {
    const { data, error: tablesError } = await fetchTableSummaries();
    if (tablesError) {
      setTables([]);
      return;
    }
    setTables(mapTablesResponse(data));
  }, []);

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
    void loadTables();
    const unsub = subscribeToReservationChanges({
      onChange: () => {
        void load();
        void loadTables();
      },
    });
    return unsub;
  }, [open, load, loadTables]);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setError(null);
      setShowCreate(false);
      setTablePickerOpen(false);
      setCheckInTableId("");
    }
  }, [open]);

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );
  const canCheckInSelected = selected ? canCheckIn(selected.status) : false;
  const checkInOccupied = checkInTableId ? isOccupiedTable(tables, checkInTableId) : false;

  const handleBooked = useCallback(
    (info: { id: string; bookingCode: string }) => {
      setShowCreate(false);
      if (info.id) setSelectedId(info.id);
      void load();
    },
    [load],
  );

  const completeCheckIn = useCallback(
    async (row: ReservationRecord, tableId: string) => {
      if (checkInLockRef.current) return;
      checkInLockRef.current = true;
      setBusyId(row.id);
      setError(null);

      try {
        const { data: profile } = await fetchGuestVisitProfile({
          email: row.guestEmail,
          phone: row.guestPhone,
          excludeReservationId: row.id,
          beforeAt: row.reservedAt,
        });

        const result = await checkInReservationWithTable(row.id, tableId, {
          allowOccupied: true,
        });

        if (result.error) {
          setError(result.error instanceof Error ? result.error.message : String(result.error));
          return;
        }

        const tableLabel =
          tables.find((table) => table.id === tableId)?.label ?? row.tableLabel ?? null;

        welcomedIdsRef.current.add(row.id);
        const payload: CfdWelcomePayload = {
          reservationId: row.id,
          guestName: row.guestName,
          isReturning: profile.isReturning,
          tableLabel,
        };
        setTablePickerOpen(false);
        setCheckInTableId("");
        onClose();
        onWelcome(payload);
        void sendCfdEvent("GUEST_WELCOME", payload);
        void load();
        void loadTables();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Check-in failed.");
      } finally {
        setBusyId(null);
        checkInLockRef.current = false;
      }
    },
    [tables, onClose, onWelcome, load, loadTables],
  );

  const handleCheckInClick = useCallback(() => {
    if (!selected || !canCheckIn(selected.status) || busyId != null) return;
    setError(null);
    // Always confirm table at check-in. Assigned table is a staff preview only.
    setCheckInTableId(selected.tableId ?? "");
    setTablePickerOpen(true);
    void loadTables();
  }, [selected, busyId, loadTables]);

  const handleConfirmTableCheckIn = useCallback(() => {
    if (!selected || !checkInTableId) return;
    void completeCheckIn(selected, checkInTableId);
  }, [selected, checkInTableId, completeCheckIn]);

  return (
    <aside
      className={`landing-theme absolute inset-0 z-40 flex w-full flex-col border-r-0 bg-[#0B0B0C] shadow-none transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
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
          <h2 className="landing-serif mt-1 text-2xl text-[#F5EDE4]">
            {showCreate ? translate("newReservation") : "Today"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {!showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              aria-label={translate("newReservation")}
              className="rounded-full border border-[#C9A88B]/45 bg-[#8B1E2D]/30 p-2.5 text-[#E8D5C4] transition hover:bg-[#8B1E2D]/50 hover:text-white"
            >
              <Plus className="h-5 w-5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (showCreate) {
                setShowCreate(false);
                setError(null);
                return;
              }
              onClose();
            }}
            aria-label={showCreate ? "Back to list" : "Close reservations"}
            className="rounded-full border border-white/15 p-2.5 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {showCreate ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <ReservationBookingView
            website={website}
            embedded
            emailOptional
            onBooked={handleBooked}
          />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
            {loading && rows.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : error && rows.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-[#E8D5C4]/80">{error}</p>
            ) : rows.length === 0 ? (
              <div className="px-2 py-10 text-center">
                <p className="text-sm text-white/45">No reservations today.</p>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="mt-4 inline-flex items-center gap-2 border border-[#C9A88B]/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#C9A88B] transition hover:bg-[#8B1E2D]/30 hover:text-white"
                >
                  <Plus className="h-4 w-4" />
                  {translate("newReservation")}
                </button>
              </div>
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
                    ? row.status === "checked_in"
                      ? `Table ${row.tableLabel}`
                      : `${translate("resTablePlanned")}: ${row.tableLabel}`
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
                            <p className="truncate text-xl font-semibold text-white sm:text-2xl">
                              {row.guestName}
                            </p>
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
                              row.tableLabel?.trim()
                                ? row.status === "checked_in"
                                  ? "text-[#C9A88B]/90"
                                  : "text-white/55"
                                : "text-amber-200/80"
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
            {error && !tablePickerOpen ? (
              <p className="mb-3 text-center text-xs text-amber-200/90">{error}</p>
            ) : null}
            <button
              type="button"
              disabled={!canCheckInSelected || busyId != null}
              onClick={handleCheckInClick}
              className="flex w-full items-center justify-center gap-2 bg-[#8B1E2D] px-6 py-5 text-lg font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#A02435] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busyId ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {translate("checkIn")}
            </button>
            <p className="mt-2 text-center text-[11px] text-white/35">
              {canCheckInSelected
                ? selected?.tableLabel
                  ? `${translate("resTablePlanned")}: ${selected.tableLabel}`
                  : translate("selectTable")
                : "Select a confirmed or late reservation"}
            </p>
          </div>
        </>
      )}

      {tablePickerOpen && selected ? (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/65 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={translate("checkIn")}
            className="w-full max-w-md border border-white/15 bg-[#121214] p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#C9A88B]">
                  {translate("checkIn")}
                </p>
                <p className="landing-serif mt-1 text-2xl text-[#F5EDE4]">{selected.guestName}</p>
                <p className="mt-1 text-sm text-white/55">
                  {selected.partySize} {translate("partySize").toLowerCase()}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setTablePickerOpen(false);
                  setCheckInTableId("");
                }}
                className="rounded-full border border-white/15 p-2 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="block text-sm">
              <span className="text-white/50">{translate("selectTable")}</span>
              <ReservationTableSelect
                tables={tables}
                value={checkInTableId}
                onChange={setCheckInTableId}
                className="pos-input mt-1"
              />
            </label>

            {checkInOccupied ? (
              <p className="mt-3 border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
                {translate("tableOccupiedWarning")}
              </p>
            ) : null}

            {error ? <p className="mt-3 text-sm text-amber-200/90">{error}</p> : null}

            <button
              type="button"
              disabled={!checkInTableId || busyId === selected.id}
              onClick={handleConfirmTableCheckIn}
              className="mt-5 flex w-full items-center justify-center gap-2 bg-[#8B1E2D] px-6 py-4 text-base font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-[#A02435] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busyId === selected.id ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {translate("checkIn")}
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
