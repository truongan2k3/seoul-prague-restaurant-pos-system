"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
import { GuestReturningBadge } from "@/components/guest-returning-badge";
import { HeaderClockWithStatus } from "@/components/connection-status-badge";
import { Modal } from "@/components/modal";
import { DateRangeInputs } from "@/components/date-range-inputs";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { useNotifications } from "@/contexts/notification-context";
import {
  canAssignTable,
  canCancelReservation,
  canCheckIn,
  canConfirmReservation,
  canEditReservation,
  canMarkNoShow,
  computeReservationStats,
  filterReservationsByPeriod,
  filterReservationsByStatus,
  isLateReservation,
  reservationStatusLabelKey,
  reservationStatusTone,
  shiftIsoDate,
  weekBoundsForDate,
  type ReservationPeriod,
  type ReservationStatusFilter,
} from "@/lib/reservation-analytics";
import { filterButtonClass } from "@/lib/theme-classes";
import { toDateInputValue } from "@/lib/summary-analytics";
import {
  RESERVATION_UNDO_MS,
  type ReservationUndoEntry,
} from "@/lib/reservation-undo";
import { pickEventTypeLabel } from "@/lib/reservation-guest-form";
import type { ReservationRecord, RestaurantTable } from "@/lib/types";
import { ReservationTableSelect, isOccupiedTable } from "@/components/reservation-table-select";
import { ReservationUndoBar } from "@/components/reservation-undo-bar";
import { PartySizeStepper } from "@/components/reservation-party-size-stepper";
import { ReservationDateTimeFields } from "@/components/reservation-datetime-fields";
import {
  ReservationSourceBadge,
  ReservationSourcePicker,
  type StaffBookingSource,
} from "@/components/reservation-source-ui";
import {
  assignReservationTable,
  cancelReservation,
  checkInReservationWithTable,
  createReservation,
  fetchReservationSnapshot,
  fetchReservations,
  fetchTableSnapshot,
  mapReservationsResponse,
  markLateReservations,
  markReservationNoShow,
  restoreReservationSnapshot,
  restoreTableSnapshot,
  subscribeToReservationChanges,
  updateReservationDetails,
} from "@/src/lib/reservation-actions";

async function confirmReservationWithEmail(reservationId: string) {
  const response = await fetch("/api/reservations/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: reservationId }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    return { error: new Error(payload.error || "Failed to confirm reservation") };
  }
  return { error: null };
}

async function cancelReservationWithEmail(reservationId: string) {
  const result = await cancelReservation(reservationId);
  if (result.error) return result;
  void fetch("/api/reservations/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: reservationId, type: "cancelled" }),
  }).catch(() => undefined);
  return result;
}

async function updateReservationWithEmail(
  reservationId: string,
  input: Parameters<typeof updateReservationDetails>[1],
) {
  const result = await updateReservationDetails(reservationId, input);
  if (result.error) return result;
  void fetch("/api/reservations/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: reservationId, type: "updated" }),
  }).catch(() => undefined);
  return result;
}

function toDateTimeLocalValue(date: Date): string {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 16);
}

const PERIOD_OPTIONS: ReservationPeriod[] = ["day", "upcoming", "range"];

const PERIOD_LABEL_KEYS = {
  day: "resPeriodDay",
  week: "resPeriodWeek",
  range: "resPeriodRange",
  upcoming: "resPeriodUpcoming",
  all: "resPeriodAll",
  today: "summaryToday",
} as const;

const STATUS_FILTER_OPTIONS: { value: ReservationStatusFilter; labelKey: "resFilterAll" | "resFilterPending" | "resFilterConfirmed" | "resFilterLate" | "resFilterCheckedIn" | "resFilterNoShow" }[] = [
  { value: "all", labelKey: "resFilterAll" },
  { value: "pending", labelKey: "resFilterPending" },
  { value: "confirmed", labelKey: "resFilterConfirmed" },
  { value: "late", labelKey: "resFilterLate" },
  { value: "checked_in", labelKey: "resFilterCheckedIn" },
  { value: "no_show", labelKey: "resFilterNoShow" },
];

const LATE_SLA_INTERVAL_MS = 60_000;

interface ReservationsViewProps {
  tables: RestaurantTable[];
  onRefreshTables?: () => void;
}

export function ReservationsView({ tables, onRefreshTables }: ReservationsViewProps) {
  const { translate, language, currentStaffUser } = useApp();
  const { settings } = useSettings();
  const { pushNotification } = useNotifications();
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [period, setPeriod] = useState<ReservationPeriod>("day");
  const [anchorDate, setAnchorDate] = useState(() => toDateInputValue(new Date()));
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(new Date()));
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()));
  const [statusFilter, setStatusFilter] = useState<ReservationStatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ReservationRecord | null>(null);
  const [checkInTarget, setCheckInTarget] = useState<ReservationRecord | null>(null);
  const [editTarget, setEditTarget] = useState<ReservationRecord | null>(null);
  const seenReservationIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);

  const [formGuestName, setFormGuestName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPartySize, setFormPartySize] = useState(2);
  const [formDateTime, setFormDateTime] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formTableId, setFormTableId] = useState("");
  const [formEventType, setFormEventType] = useState("");
  const [formSource, setFormSource] = useState<StaffBookingSource>("phone_call");
  const [assignTableId, setAssignTableId] = useState("");
  const [checkInTableId, setCheckInTableId] = useState("");
  const [undoEntry, setUndoEntry] = useState<ReservationUndoEntry | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date();
    since.setFullYear(since.getFullYear() - 1);
    since.setHours(0, 0, 0, 0);
    const { data, error: fetchError } = await fetchReservations(since);
    if (fetchError) {
      setError(fetchError.message);
      setReservations([]);
    } else {
      const mapped = mapReservationsResponse(data);
      setReservations(mapped);
      if (!initialLoadDoneRef.current) {
        mapped.forEach((row) => seenReservationIdsRef.current.add(row.id));
        initialLoadDoneRef.current = true;
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadReservations();
    const unsub = subscribeToReservationChanges({
      onChange: () => void loadReservations(),
    });
    return unsub;
  }, [loadReservations]);

  useEffect(() => {
    const runLateCheck = () => {
      void markLateReservations(settings.reservationTableHoldingTime).then(({ updated, error: lateError }) => {
        if (lateError) return;
        if (updated > 0) void loadReservations();
      });
    };

    runLateCheck();
    const intervalId = window.setInterval(runLateCheck, LATE_SLA_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadReservations, settings.reservationTableHoldingTime]);

  useEffect(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setFormDateTime(now.toISOString().slice(0, 16));
  }, [showNewModal]);

  const periodOptions = useMemo(() => {
    if (period === "day" || period === "today") {
      return { anchorDate, from: anchorDate, to: anchorDate };
    }
    if (period === "week") {
      const bounds = weekBoundsForDate(anchorDate);
      return { anchorDate, from: bounds.from, to: bounds.to };
    }
    if (period === "range") {
      return { from: customFrom, to: customTo, anchorDate };
    }
    return { anchorDate };
  }, [period, anchorDate, customFrom, customTo]);

  const filtered = useMemo(() => {
    const byPeriod = filterReservationsByPeriod(reservations, period, periodOptions);
    return filterReservationsByStatus(byPeriod, statusFilter);
  }, [reservations, period, statusFilter, periodOptions]);

  const stats = useMemo(
    () => computeReservationStats(filterReservationsByPeriod(reservations, period, periodOptions)),
    [reservations, period, periodOptions],
  );

  const jumpToToday = () => setAnchorDate(toDateInputValue(new Date()));

  const shiftAnchor = (days: number) => {
    setAnchorDate((prev) => shiftIsoDate(prev, days));
  };

  const dateNavLocale = language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB";

  const dayLabel = useMemo(() => {
    const date = new Date(`${anchorDate}T12:00:00`);
    return date.toLocaleDateString(dateNavLocale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, [anchorDate, dateNavLocale]);

  const showDayNav = period === "day";
  const isTodayAnchor = anchorDate === toDateInputValue(new Date());

  const emptyTables = useMemo(
    () => tables.filter((table) => table.status === "empty"),
    [tables],
  );

  const assignOccupied = assignTableId ? isOccupiedTable(tables, assignTableId) : false;
  const checkInOccupied = checkInTableId ? isOccupiedTable(tables, checkInTableId) : false;

  const queueUndo = useCallback(
    (entry: Omit<ReservationUndoEntry, "expiresAt">) => {
      setUndoEntry({
        ...entry,
        expiresAt: Date.now() + RESERVATION_UNDO_MS,
      });
    },
    [],
  );

  const handleUndo = async (entry: ReservationUndoEntry) => {
    setUndoBusy(true);
    setError(null);

    const { error: reservationError } = await restoreReservationSnapshot(entry.reservation);
    if (reservationError) {
      setUndoBusy(false);
      setError(translate("resUndoFailed"));
      setUndoEntry(null);
      return;
    }

    if (entry.table) {
      const { error: tableError } = await restoreTableSnapshot(entry.table);
      if (tableError) {
        setUndoBusy(false);
        setError(translate("resUndoFailed"));
        setUndoEntry(null);
        return;
      }
      onRefreshTables?.();
    }

    setUndoBusy(false);
    setUndoEntry(null);
    pushNotification({ message: translate("resUndoSuccess"), playSound: false });
    void loadReservations();
  };

  const runAction = async (id: string, action: () => Promise<{ error: unknown | null }>) => {
    setBusyId(id);
    const { error: actionError } = await action();
    setBusyId(null);
    if (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : String(actionError),
      );
      return;
    }
    void loadReservations();
  };

  const handleCreateReservation = async () => {
    if (!formGuestName.trim() || !formDateTime) return;
    setBusyId("new");
    const { error: createError } = await createReservation({
      guestName: formGuestName.trim(),
      guestPhone: formPhone.trim() || undefined,
      guestEmail: formEmail.trim() || undefined,
      partySize: Math.max(1, formPartySize),
      reservedAt: new Date(formDateTime),
      notes: formNotes.trim() || undefined,
      tableId: formTableId || undefined,
      staffId: currentStaffUser?.id,
      staffName: currentStaffUser?.name,
      source: formSource,
    });
    setBusyId(null);
    if (createError) {
      setError(createError.message);
      return;
    }
    setShowNewModal(false);
    setFormGuestName("");
    setFormPhone("");
    setFormEmail("");
    setFormNotes("");
    setFormTableId("");
    setFormSource("phone_call");
    void loadReservations();
  };

  const openEditModal = (row: ReservationRecord) => {
    setEditTarget(row);
    setFormGuestName(row.guestName);
    setFormPhone(row.guestPhone ?? "");
    setFormEmail(row.guestEmail ?? "");
    setFormPartySize(row.partySize);
    setFormDateTime(toDateTimeLocalValue(row.reservedAt));
    setFormNotes(row.notes ?? "");
    setFormTableId(row.tableId ?? "");
    setFormEventType(row.eventType ?? "");
    setError(null);
  };

  const handleUpdateReservation = async () => {
    if (!editTarget || !formGuestName.trim() || !formDateTime) return;
    setBusyId(editTarget.id);
    const { error: updateError } = await updateReservationWithEmail(editTarget.id, {
      guestName: formGuestName.trim(),
      guestPhone: formPhone.trim() || undefined,
      guestEmail: formEmail.trim() || undefined,
      partySize: Math.max(1, formPartySize),
      reservedAt: new Date(formDateTime),
      notes: formNotes.trim() || undefined,
      tableId: editTarget.status === "checked_in" ? undefined : formTableId || null,
      eventType: formEventType || null,
    });
    setBusyId(null);
    if (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
      return;
    }
    setEditTarget(null);
    void loadReservations();
  };

  const handleAssign = async () => {
    if (!assignTarget || !assignTableId) return;

    const snapshot = await fetchReservationSnapshot(assignTarget.id);
    if (!snapshot) {
      setError(translate("resUndoFailed"));
      return;
    }

    setBusyId(assignTarget.id);
    const { error: assignError } = await assignReservationTable(assignTarget.id, assignTableId, {
      allowOccupied: assignOccupied,
    });
    setBusyId(null);

    if (assignError) {
      setError(assignError instanceof Error ? assignError.message : String(assignError));
      return;
    }

    queueUndo({
      id: `${assignTarget.id}-assign-${Date.now()}`,
      action: "assign",
      reservation: snapshot,
    });
    setAssignTarget(null);
    setAssignTableId("");
    void loadReservations();
  };

  const handleCheckIn = async () => {
    if (!checkInTarget || !checkInTableId) return;

    const snapshot = await fetchReservationSnapshot(checkInTarget.id);
    if (!snapshot) {
      setError(translate("resUndoFailed"));
      return;
    }

    const tableSnapshot = checkInOccupied ? undefined : (await fetchTableSnapshot(checkInTableId)) ?? undefined;

    setBusyId(checkInTarget.id);
    const { error: checkInError } = await checkInReservationWithTable(
      checkInTarget.id,
      checkInTableId,
      { allowOccupied: checkInOccupied },
    );
    setBusyId(null);

    if (checkInError) {
      setError(checkInError instanceof Error ? checkInError.message : String(checkInError));
      return;
    }

    queueUndo({
      id: `${checkInTarget.id}-checkin-${Date.now()}`,
      action: "check_in",
      reservation: snapshot,
      table: tableSnapshot,
    });
    setCheckInTarget(null);
    setCheckInTableId("");
    void loadReservations();
    onRefreshTables?.();
  };

  const handleCancelReservation = async (row: ReservationRecord) => {
    const confirmed = window.confirm(
      translate("confirmCancelReservation").replace("{name}", row.guestName),
    );
    if (!confirmed) return;

    const snapshot = await fetchReservationSnapshot(row.id);
    if (!snapshot) {
      setError(translate("resUndoFailed"));
      return;
    }

    setBusyId(row.id);
    const { error: cancelError } = await cancelReservationWithEmail(row.id);
    setBusyId(null);

    if (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
      return;
    }

    queueUndo({
      id: `${row.id}-cancel-${Date.now()}`,
      action: "cancel",
      reservation: snapshot,
    });
    void loadReservations();
  };

  const handleMarkNoShow = async (row: ReservationRecord) => {
    const confirmed = window.confirm(
      translate("confirmMarkNoShow").replace("{name}", row.guestName),
    );
    if (!confirmed) return;
    await runAction(row.id, () => markReservationNoShow(row.id));
  };

  const formatDateTime = (date: Date) =>
    date.toLocaleString(language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const cardClassName = (row: ReservationRecord) =>
    isLateReservation(row)
      ? "rounded-xl border-2 border-orange-500 bg-orange-50 p-2.5 shadow-sm animate-pulse dark:border-orange-500 dark:bg-orange-950/40 sm:p-4"
      : "rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-4";

  return (
    <div className="flex h-full flex-col bg-background text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200/80 bg-background px-2 py-1.5 dark:border-gray-800 dark:bg-gray-900 sm:gap-3 sm:px-4 sm:py-2 lg:px-6">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <h1 className="shrink-0 text-sm font-semibold sm:text-base lg:text-lg">{translate("reservations")}</h1>
          <HeaderClockWithStatus />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              setFormSource("phone_call");
              setShowNewModal(true);
            }}
            className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-[11px] font-semibold text-white dark:bg-gray-100 dark:text-gray-900 sm:gap-1.5 sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-xs"
          >
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {translate("newReservation")}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-2.5 sm:p-4 lg:p-6">
        <div className="mx-auto max-w-6xl space-y-3 sm:space-y-4 lg:space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-800 sm:p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:text-xs">
                {translate("resAdvancedStats")}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setPeriod(option);
                      if (option === "day") {
                        setAnchorDate((prev) => prev || toDateInputValue(new Date()));
                      }
                      if (option === "range") {
                        setCustomFrom(anchorDate);
                        setCustomTo(anchorDate);
                      }
                    }}
                    className={filterButtonClass(period === option)}
                  >
                    {translate(PERIOD_LABEL_KEYS[option])}
                  </button>
                ))}
              </div>

              {showDayNav ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => shiftAnchor(-1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    aria-label={translate("resPrevDay")}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <label className="relative inline-flex min-w-[9.5rem] cursor-pointer items-center justify-center">
                    <span className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-center text-xs font-semibold tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 sm:text-sm">
                      {dayLabel}
                    </span>
                    <input
                      type="date"
                      value={anchorDate}
                      onChange={(event) => setAnchorDate(event.target.value)}
                      className="absolute inset-0 z-10 cursor-pointer opacity-0"
                      aria-label={translate("resPeriodDay")}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => shiftAnchor(1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    aria-label={translate("resNextDay")}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={jumpToToday}
                    disabled={isTodayAnchor}
                    className={filterButtonClass(isTodayAnchor)}
                  >
                    {translate("resTodayJump")}
                  </button>
                </div>
              ) : null}

              {period === "range" ? (
                <div className="min-w-0 flex-1 sm:max-w-md">
                  <DateRangeInputs
                    from={customFrom}
                    to={customTo}
                    onFromChange={setCustomFrom}
                    onToChange={setCustomTo}
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {STATUS_FILTER_OPTIONS.map(({ value, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={filterButtonClass(statusFilter === value)}
                >
                  {translate(labelKey)}
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {(
              [
                { label: "resTotalGuests" as const, value: stats.totalGuests },
                { label: "resTotalBookings" as const, value: stats.totalBookings },
                { label: "resPending" as const, value: stats.pendingConfirmation },
                { label: "resLate" as const, value: stats.late },
                { label: "resCheckedIn" as const, value: stats.checkedIn },
                { label: "resNoShows" as const, value: stats.noShows },
              ] as const
            ).map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-800 sm:p-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {translate(label)}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:mt-2 sm:text-2xl">{value}</p>
              </div>
            ))}
          </section>

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{translate("loading")}</p>
          ) : filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {translate("resNoResults")}
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map((row) => (
                <article key={row.id} className={cardClassName(row)}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold sm:text-base lg:text-lg">{row.guestName}</h2>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:text-xs ${
                            isLateReservation(row)
                              ? reservationStatusTone("late")
                              : reservationStatusTone(row.status)
                          }`}
                        >
                          {translate(reservationStatusLabelKey(row.status))}
                        </span>
                        <ReservationSourceBadge
                          source={row.source}
                          phoneLabel={translate("resSourcePhoneCall")}
                          onlineLabel={translate("resSourceOnline")}
                        />
                      </div>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {formatDateTime(row.reservedAt)} · {row.partySize} {translate("partySize").toLowerCase()}
                        {row.guestPhone ? ` · ${row.guestPhone}` : ""}
                        {row.bookingCode ? ` · ${row.bookingCode}` : ""}
                      </p>
                      {row.tableLabel && (
                        <p className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                          <MapPin className="h-4 w-4" />
                          {translate("table")} {row.tableLabel}
                        </p>
                      )}
                      {row.eventType ? (
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {pickEventTypeLabel(
                            settings.reservationEventTypes.find((option) => option.id === row.eventType) ?? {
                              id: row.eventType,
                              labels: {
                                en: row.eventType,
                                cs: row.eventType,
                                vi: row.eventType,
                                de: row.eventType,
                                ko: row.eventType,
                              },
                            },
                            "en",
                          )}
                        </p>
                      ) : null}
                      {row.notes && (
                        <p className="mt-1 text-sm italic text-gray-500">{row.notes}</p>
                      )}
                      <GuestReturningBadge
                        email={row.guestEmail}
                        phone={row.guestPhone}
                        excludeReservationId={row.id}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {canEditReservation(row.status) && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => openEditModal(row)}
                          aria-label={translate("editReservation")}
                          title={translate("editReservation")}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canConfirmReservation(row.status) && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void runAction(row.id, () => confirmReservationWithEmail(row.id))}
                          className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
                        >
                          {translate("confirmReservation")}
                        </button>
                      )}
                      {canCheckIn(row.status) && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => {
                            setCheckInTarget(row);
                            setCheckInTableId(row.tableId ?? "");
                          }}
                          className="rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-500 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
                        >
                          {translate("checkIn")}
                        </button>
                      )}
                      {canAssignTable(row.status) && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => {
                            setAssignTarget(row);
                            setAssignTableId(row.tableId ?? "");
                          }}
                          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold dark:border-gray-600"
                        >
                          {translate("assignTable")}
                        </button>
                      )}
                      {canMarkNoShow(row.status) && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void handleMarkNoShow(row)}
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-950"
                        >
                          {translate("markNoShow")}
                        </button>
                      )}
                      {canCancelReservation(row.status) && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void handleCancelReservation(row)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          {translate("cancelReservation")}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showNewModal}
        onClose={() => {
          setFormSource("phone_call");
          setShowNewModal(false);
        }}
        title={translate("newReservation")}
      >
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-500">{translate("guestName")}</span>
            <input value={formGuestName} onChange={(e) => setFormGuestName(e.target.value)} className="pos-input mt-1" />
          </label>
          <div className="block text-sm">
            <span className="text-gray-500">{translate("reservationSource")}</span>
            <div className="mt-1">
              <ReservationSourcePicker
                value={formSource}
                onChange={setFormSource}
                phoneLabel={translate("resSourcePhoneCall")}
                onlineLabel={translate("resSourceOnline")}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-gray-500">{translate("guestPhone")}</span>
              <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} className="pos-input mt-1" />
            </label>
            <PartySizeStepper
              value={formPartySize}
              onChange={setFormPartySize}
              max={settings.reservationMaxGuestsPerSlot || 50}
              label={translate("partySize")}
            />
          </div>
          <label className="block text-sm">
            <span className="text-gray-500">{translate("guestEmail")}</span>
            <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="pos-input mt-1" />
          </label>
          <ReservationDateTimeFields
            value={formDateTime}
            onChange={setFormDateTime}
            settings={settings}
            dateLabel={translate("reservedDate")}
            timeLabel={translate("reservedTime")}
          />
          <label className="block text-sm">
            <span className="text-gray-500">{translate("selectTable")}</span>
            <select value={formTableId} onChange={(e) => setFormTableId(e.target.value)} className="pos-input mt-1">
              <option value="">{translate("selectEmptyTable")}</option>
              {emptyTables.map((table) => (
                <option key={table.id} value={table.id}>{translate("table")} {table.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-500">{translate("resNotes")}</span>
            <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="pos-input mt-1 min-h-[72px]" />
          </label>
          <button type="button" disabled={busyId === "new"} onClick={() => void handleCreateReservation()} className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900">
            {translate("saveReservation")}
          </button>
        </div>
      </Modal>

      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={translate("editReservation")}
      >
        {editTarget ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {editTarget.bookingCode ? `${editTarget.bookingCode} · ` : ""}
              {translate(reservationStatusLabelKey(editTarget.status))}
            </p>
            <label className="block text-sm">
              <span className="text-gray-500">{translate("guestName")}</span>
              <input value={formGuestName} onChange={(e) => setFormGuestName(e.target.value)} className="pos-input mt-1" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-gray-500">{translate("guestPhone")}</span>
                <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} className="pos-input mt-1" />
              </label>
              <PartySizeStepper
                value={formPartySize}
                onChange={setFormPartySize}
                max={settings.reservationMaxGuestsPerSlot || 50}
                label={translate("partySize")}
              />
            </div>
            <label className="block text-sm">
              <span className="text-gray-500">{translate("guestEmail")}</span>
              <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="pos-input mt-1" />
            </label>
            <ReservationDateTimeFields
              value={formDateTime}
              onChange={setFormDateTime}
              settings={settings}
              dateLabel={translate("reservedDate")}
              timeLabel={translate("reservedTime")}
            />
            {editTarget.status !== "checked_in" ? (
              <label className="block text-sm">
                <span className="text-gray-500">{translate("selectTable")}</span>
                <select value={formTableId} onChange={(e) => setFormTableId(e.target.value)} className="pos-input mt-1">
                  <option value="">{translate("selectEmptyTable")}</option>
                  {emptyTables.map((table) => (
                    <option key={table.id} value={table.id}>{translate("table")} {table.label}</option>
                  ))}
                </select>
              </label>
            ) : editTarget.tableLabel ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {translate("table")} {editTarget.tableLabel}
              </p>
            ) : null}
            {settings.reservationEventTypes.length > 0 ? (
              <label className="block text-sm">
                <span className="text-gray-500">{translate("resEventType")}</span>
                <select value={formEventType} onChange={(e) => setFormEventType(e.target.value)} className="pos-input mt-1">
                  <option value="">—</option>
                  {settings.reservationEventTypes.map((option) => (
                    <option key={option.id} value={option.id}>
                      {pickEventTypeLabel(option, language === "cs" ? "cs" : language === "zh" ? "en" : "en")}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block text-sm">
              <span className="text-gray-500">{translate("resNotes")}</span>
              <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="pos-input mt-1 min-h-[72px]" />
            </label>
            <button
              type="button"
              disabled={busyId === editTarget.id || !formGuestName.trim() || !formDateTime}
              onClick={() => void handleUpdateReservation()}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {translate("saveReservation")}
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal open={assignTarget !== null} onClose={() => setAssignTarget(null)} title={translate("assignTable")}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {assignTarget?.guestName} · {assignTarget?.partySize} {translate("partySize").toLowerCase()}
          </p>
          <ReservationTableSelect
            tables={tables}
            value={assignTableId}
            onChange={setAssignTableId}
          />
          {assignOccupied ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {translate("tableOccupiedWarning")}
            </p>
          ) : null}
          <button type="button" disabled={!assignTableId || busyId === assignTarget?.id} onClick={() => void handleAssign()} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {translate("assignTable")}
          </button>
        </div>
      </Modal>

      <Modal
        open={checkInTarget !== null}
        onClose={() => {
          setCheckInTarget(null);
          setCheckInTableId("");
        }}
        title={translate("checkIn")}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {checkInTarget?.guestName} · {checkInTarget?.partySize} {translate("partySize").toLowerCase()}
          </p>
          <label className="block text-sm">
            <span className="text-gray-500">{translate("selectTable")}</span>
            <ReservationTableSelect
              tables={tables}
              value={checkInTableId}
              onChange={setCheckInTableId}
              className="pos-input mt-1"
            />
          </label>
          {checkInOccupied ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {translate("tableOccupiedWarning")}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!checkInTableId || busyId === checkInTarget?.id}
            onClick={() => void handleCheckIn()}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {translate("checkIn")}
          </button>
        </div>
      </Modal>

      <ReservationUndoBar
        entry={undoEntry}
        busy={undoBusy}
        onUndo={(entry) => void handleUndo(entry)}
        onExpire={() => setUndoEntry(null)}
      />
    </div>
  );
}
