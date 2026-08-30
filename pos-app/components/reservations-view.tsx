"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Plus, UserPlus } from "lucide-react";
import { LiveClock } from "@/components/live-clock";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { useNotifications } from "@/contexts/notification-context";
import {
  canAssignTable,
  canCancelReservation,
  canCheckIn,
  canConfirmReservation,
  canMarkNoShow,
  computeReservationStats,
  filterReservationsByPeriod,
  filterReservationsByStatus,
  isLateReservation,
  reservationStatusLabelKey,
  type ReservationPeriod,
  type ReservationStatusFilter,
} from "@/lib/reservation-analytics";
import { filterButtonClass } from "@/lib/theme-classes";
import {
  RESERVATION_UNDO_MS,
  type ReservationUndoEntry,
} from "@/lib/reservation-undo";
import { pickEventTypeLabel } from "@/lib/reservation-guest-form";
import type { ReservationRecord, RestaurantTable } from "@/lib/types";
import { ReservationTableSelect, isOccupiedTable } from "@/components/reservation-table-select";
import { ReservationUndoBar } from "@/components/reservation-undo-bar";
import {
  assignReservationTable,
  cancelReservation,
  checkInReservationWithTable,
  createReservation,
  createWalkIn,
  fetchReservationSnapshot,
  fetchReservations,
  fetchTableSnapshot,
  mapReservationsResponse,
  markLateReservations,
  markReservationNoShow,
  restoreReservationSnapshot,
  restoreTableSnapshot,
  subscribeToReservationChanges,
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

const PERIOD_OPTIONS: ReservationPeriod[] = ["today", "week", "month"];

const PERIOD_LABEL_KEYS = {
  today: "summaryToday",
  week: "summaryWeek",
  month: "summaryMonth",
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
  const [period, setPeriod] = useState<ReservationPeriod>("today");
  const [statusFilter, setStatusFilter] = useState<ReservationStatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ReservationRecord | null>(null);
  const [checkInTarget, setCheckInTarget] = useState<ReservationRecord | null>(null);
  const seenReservationIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);

  const [formGuestName, setFormGuestName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPartySize, setFormPartySize] = useState(2);
  const [formDateTime, setFormDateTime] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formTableId, setFormTableId] = useState("");
  const [walkInPartySize, setWalkInPartySize] = useState(2);
  const [walkInName, setWalkInName] = useState("");
  const [walkInTableId, setWalkInTableId] = useState("");
  const [assignTableId, setAssignTableId] = useState("");
  const [checkInTableId, setCheckInTableId] = useState("");
  const [undoEntry, setUndoEntry] = useState<ReservationUndoEntry | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date();
    since.setDate(since.getDate() - 60);
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
      onInsert: (reservation) => {
        if (seenReservationIdsRef.current.has(reservation.id)) return;
        seenReservationIdsRef.current.add(reservation.id);
        if (reservation.source !== "reservation") return;

        const timeLabel = reservation.reservedAt.toLocaleString(
          language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB",
          { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
        );

        pushNotification({
          id: `reservation-${reservation.id}`,
          message: `${translate("resNewBookingToast")}: ${reservation.guestName} · ${reservation.partySize} · ${timeLabel}`,
          playSound: "newOrder",
        });
      },
    });
    return unsub;
  }, [language, loadReservations, pushNotification, translate]);

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

  const filtered = useMemo(() => {
    const byPeriod = filterReservationsByPeriod(reservations, period);
    return filterReservationsByStatus(byPeriod, statusFilter);
  }, [reservations, period, statusFilter]);

  const stats = useMemo(
    () => computeReservationStats(filterReservationsByPeriod(reservations, period)),
    [reservations, period],
  );

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
    void loadReservations();
  };

  const handleWalkIn = async () => {
    if (!walkInTableId) return;
    setBusyId("walkin");
    const { error: createError } = await createWalkIn({
      partySize: Math.max(1, walkInPartySize),
      tableId: walkInTableId,
      guestName: walkInName.trim() || undefined,
      staffId: currentStaffUser?.id,
      staffName: currentStaffUser?.name,
    });
    setBusyId(null);
    if (createError) {
      setError(createError.message);
      return;
    }
    setShowWalkInModal(false);
    setWalkInName("");
    setWalkInTableId("");
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

  const formatDateTime = (date: Date) =>
    date.toLocaleString(language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const cardClassName = (row: ReservationRecord) =>
    isLateReservation(row)
      ? "rounded-xl border-2 border-orange-500 bg-orange-50 p-4 shadow-sm animate-pulse dark:border-orange-500 dark:bg-orange-950/40"
      : "rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800";

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-lg font-semibold">{translate("reservations")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowWalkInModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium dark:border-gray-700"
          >
            <UserPlus className="h-4 w-4" />
            {translate("walkIn")}
          </button>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
          >
            <Plus className="h-4 w-4" />
            {translate("newReservation")}
          </button>
          <LiveClock />
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {translate("resAdvancedStats")}
            </p>
            <div className="flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPeriod(option)}
                  className={filterButtonClass(period === option)}
                >
                  {translate(PERIOD_LABEL_KEYS[option])}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
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

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
            {(
              [
                { label: "resTotalGuests" as const, value: stats.totalGuests },
                { label: "resTotalBookings" as const, value: stats.totalBookings },
                { label: "resPending" as const, value: stats.pendingConfirmation },
                { label: "resLate" as const, value: stats.late },
                { label: "resCheckedIn" as const, value: stats.checkedIn },
                { label: "resWalkIns" as const, value: stats.walkIns },
                { label: "resNoShows" as const, value: stats.noShows },
              ] as const
            ).map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {translate(label)}
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
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
                        <h2 className="text-lg font-semibold">{row.guestName}</h2>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                            isLateReservation(row)
                              ? "bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100"
                              : "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300"
                          }`}
                        >
                          {translate(reservationStatusLabelKey(row.status))}
                        </span>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                          {translate(row.source === "walk_in" ? "resSourceWalkIn" : "resSourceReservation")}
                        </span>
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
                              labels: { en: row.eventType, vi: row.eventType, de: row.eventType, ko: row.eventType },
                            },
                            "en",
                          )}
                        </p>
                      ) : null}
                      {row.notes && (
                        <p className="mt-1 text-sm italic text-gray-500">{row.notes}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {canConfirmReservation(row.status) && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void runAction(row.id, () => confirmReservationWithEmail(row.id))}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
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
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
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
                          onClick={() => void runAction(row.id, () => markReservationNoShow(row.id))}
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

      <Modal open={showNewModal} onClose={() => setShowNewModal(false)} title={translate("newReservation")}>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-500">{translate("guestName")}</span>
            <input value={formGuestName} onChange={(e) => setFormGuestName(e.target.value)} className="pos-input mt-1" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-gray-500">{translate("guestPhone")}</span>
              <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} className="pos-input mt-1" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-500">{translate("partySize")}</span>
              <input type="number" min={1} value={formPartySize} onChange={(e) => setFormPartySize(Number(e.target.value))} className="pos-input mt-1" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-gray-500">{translate("guestEmail")}</span>
            <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="pos-input mt-1" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-500">{translate("reservedAt")}</span>
            <input type="datetime-local" value={formDateTime} onChange={(e) => setFormDateTime(e.target.value)} className="pos-input mt-1" />
          </label>
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

      <Modal open={showWalkInModal} onClose={() => setShowWalkInModal(false)} title={translate("walkIn")}>
        <div className="space-y-3">
          <p className="text-sm text-gray-500">{translate("visitSource")}: {translate("resSourceWalkIn")}</p>
          <label className="block text-sm">
            <span className="text-gray-500">{translate("guestName")}</span>
            <input value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="Walk-in" className="pos-input mt-1" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-500">{translate("partySize")}</span>
            <input type="number" min={1} value={walkInPartySize} onChange={(e) => setWalkInPartySize(Number(e.target.value))} className="pos-input mt-1" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-500">{translate("selectTable")}</span>
            <select value={walkInTableId} onChange={(e) => setWalkInTableId(e.target.value)} className="pos-input mt-1">
              <option value="">{translate("selectEmptyTable")}</option>
              {emptyTables.map((table) => (
                <option key={table.id} value={table.id}>{translate("table")} {table.label}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busyId === "walkin" || !walkInTableId} onClick={() => void handleWalkIn()} className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {translate("checkIn")}
          </button>
        </div>
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
