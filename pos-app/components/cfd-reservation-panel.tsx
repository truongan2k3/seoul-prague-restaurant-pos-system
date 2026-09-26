"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Users, X } from "lucide-react";
import {
  canCheckIn,
  filterReservationsByPeriod,
  reservationStatusLabelKey,
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

/** Dark/premium status chips for Reception cards only (presentation). */
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
              <ul className="space-y-2.5">
                {rows.map((row) => {
                  const active = row.id === selectedId;
                  const time = formatInVenueTz(row.reservedAt, language === "cs" ? "cs-CZ" : "en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: language === "en",
                  });
                  const tableLabel = row.tableLabel?.trim() || "";
                  const hasTable = tableLabel.length > 0;
                  const tableTitle = hasTable
                    ? row.status === "checked_in"
                      ? `Table ${tableLabel}`
                      : `${translate("resTablePlanned")}: ${tableLabel}`
                    : "Table: Unassigned";
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        className={`group w-full rounded-2xl border px-4 py-3.5 text-left transition duration-200 sm:px-5 sm:py-4 ${
                          active
                            ? "border-[#C9A88B]/50 bg-[#8B1E2D]/20 shadow-[0_0_0_1px_rgba(201,168,139,0.12),0_12px_32px_rgba(0,0,0,0.35)]"
                            : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.055]"
                        }`}
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
                            <div
                              title={tableTitle}
                              className={`flex w-[5.5rem] shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-2.5 sm:w-[6.25rem] sm:px-2.5 sm:py-3 ${receptionTableBadgeClass(row.status)}`}
                            >
                              <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-current/50 sm:text-[10px]">
                                Table
                              </span>
                              <span className="mt-1 text-[2rem] font-bold leading-none tracking-wide tabular-nums sm:text-[2.35rem]">
                                {tableLabel}
                              </span>
                            </div>
                          ) : null}
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
