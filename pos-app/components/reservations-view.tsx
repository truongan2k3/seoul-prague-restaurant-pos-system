"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, MapPin, ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
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
  sortReservationsForDayList,
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
import { pickEventTypeLabel, parseReservationBbqNotes } from "@/lib/reservation-guest-form";
import type { ReservationRecord, RestaurantTable } from "@/lib/types";
import {
  ReservationDualTableSelect,
  isAnyOccupiedTable,
} from "@/components/reservation-table-select";
import { ReservationUndoBar } from "@/components/reservation-undo-bar";
import { PartySizeStepper } from "@/components/reservation-party-size-stepper";
import { ReservationDateTimeFields } from "@/components/reservation-datetime-fields";
import {
  ReservationSourceBadge,
  ReservationSourcePicker,
  type StaffBookingSource,
} from "@/components/reservation-source-ui";
import {
  assignReservationTables,
  cancelReservation,
  checkInReservationWithTables,
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
import { formatReservationTableLabels } from "@/lib/reservation-tables";
import { fetchGuestVisitProfile } from "@/src/lib/guest-history-actions";
import { sendCfdEvent } from "@/lib/cfd-display";
import {
  RESERVATION_CANCEL_REASONS,
  type ReservationCancelReasonId,
} from "@/lib/reservation-cancel-reasons";
import { ReservationCapacityOverview } from "@/components/reservation-capacity-overview";

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

async function cancelReservationWithEmail(
  reservationId: string,
  options: {
    cancelledBy?: string;
    cancellationReason: string;
    cancellationNote?: string;
  },
) {
  const result = await cancelReservation(reservationId, options);
  if (result.error) return { ...result, emailSent: false as boolean, emailError: null as string | null };
  const notify = await fetch("/api/reservations/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: reservationId,
      type: "cancelled",
      cancellationReason: options.cancellationReason,
    }),
  })
    .then(async (response) => {
      const payload = (await response.json().catch(() => ({}))) as {
        emailSent?: boolean;
        emailError?: string | null;
      };
      return {
        emailSent: Boolean(payload.emailSent),
        emailError: payload.emailError ?? null,
      };
    })
    .catch(() => ({ emailSent: false, emailError: "notify_failed" }));
  return { ...result, ...notify };
}

async function markNoShowWithEmail(reservationId: string) {
  const result = await markReservationNoShow(reservationId);
  if (result.error) return result;
  void fetch("/api/reservations/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: reservationId, type: "no_show" }),
  }).catch(() => undefined);
  return result;
}

/** Staff note-only edits should not email the guest. */
function isStaffNotesOnlyChange(
  previous: ReservationRecord,
  input: Parameters<typeof updateReservationDetails>[1],
): boolean {
  const nextNotes = input.notes?.trim() || "";
  const prevNotes = previous.notes?.trim() || "";
  if (nextNotes === prevNotes) return false;

  const sameName = previous.guestName.trim() === input.guestName.trim();
  const samePhone = (previous.guestPhone ?? "").trim() === (input.guestPhone?.trim() || "");
  const sameEmail = (previous.guestEmail ?? "").trim() === (input.guestEmail?.trim() || "");
  const sameParty = previous.partySize === Math.max(1, input.partySize);
  const sameWhen = previous.reservedAt.getTime() === input.reservedAt.getTime();
  const sameEvent = (previous.eventType ?? "").trim() === (input.eventType?.trim() || "");
  const sameTable =
    input.tableId === undefined ||
    (previous.tableId ?? "") === (input.tableId || "");

  return sameName && samePhone && sameEmail && sameParty && sameWhen && sameEvent && sameTable;
}

async function updateReservationWithEmail(
  reservationId: string,
  input: Parameters<typeof updateReservationDetails>[1],
  previous?: ReservationRecord,
) {
  const result = await updateReservationDetails(reservationId, input);
  if (result.error) return result;
  if (previous && isStaffNotesOnlyChange(previous, input)) {
    return result;
  }
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
  const [cancelTarget, setCancelTarget] = useState<ReservationRecord | null>(null);
  const [cancelReason, setCancelReason] = useState<ReservationCancelReasonId | "">("");
  const [cancelNote, setCancelNote] = useState("");
  const [checkInActualParty, setCheckInActualParty] = useState(2);
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
  const [formSource, setFormSource] = useState<StaffBookingSource>("reservation");
  const [assignTableIds, setAssignTableIds] = useState<string[]>([]);
  const [checkInTableIds, setCheckInTableIds] = useState<string[]>([]);
  const [undoEntry, setUndoEntry] = useState<ReservationUndoEntry | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [capacityRefreshKey, setCapacityRefreshKey] = useState(0);
  const [showCapacityModal, setShowCapacityModal] = useState(false);

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
      setCapacityRefreshKey((key) => key + 1);
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
    const byStatus = filterReservationsByStatus(byPeriod, statusFilter);
    // Today / day view: pending & confirmed first; completed / cancelled at the bottom.
    if (period === "day" || period === "today") {
      return sortReservationsForDayList(byStatus);
    }
    return [...byStatus].sort((a, b) => a.reservedAt.getTime() - b.reservedAt.getTime());
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
  const capacityDateIso = showDayNav ? anchorDate : toDateInputValue(new Date());

  const emptyTables = useMemo(
    () => tables.filter((table) => table.status === "empty"),
    [tables],
  );

  const floorOccupiedCount = useMemo(
    () => tables.filter((table) => table.status === "waiting" || table.status === "ready").length,
    [tables],
  );

  const assignOccupied = isAnyOccupiedTable(tables, assignTableIds);
  const checkInOccupied = isAnyOccupiedTable(tables, checkInTableIds);

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

    const tableSnapshots = [
      ...(entry.tables ?? []),
      ...(entry.table && !(entry.tables ?? []).some((row) => row.id === entry.table?.id)
        ? [entry.table]
        : []),
    ];
    if (tableSnapshots.length > 0) {
      for (const snapshot of tableSnapshots) {
        const { error: tableError } = await restoreTableSnapshot(snapshot);
        if (tableError) {
          setUndoBusy(false);
          setError(translate("resUndoFailed"));
          setUndoEntry(null);
          return;
        }
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
    const guestEmail = formEmail.trim();
    const { data: created, error: createError } = await createReservation({
      guestName: formGuestName.trim(),
      guestPhone: formPhone.trim() || undefined,
      guestEmail: guestEmail || undefined,
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
    // Same "received" email as online booking when staff enters a guest email.
    if (guestEmail && created?.id) {
      void fetch("/api/reservations/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: created.id, type: "received" }),
      }).catch(() => undefined);
    }
    setShowNewModal(false);
    setFormGuestName("");
    setFormPhone("");
    setFormEmail("");
    setFormNotes("");
    setFormTableId("");
    setFormSource("reservation");
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
    const { error: updateError } = await updateReservationWithEmail(
      editTarget.id,
      {
        guestName: formGuestName.trim(),
        guestPhone: formPhone.trim() || undefined,
        guestEmail: formEmail.trim() || undefined,
        partySize: Math.max(1, formPartySize),
        reservedAt: new Date(formDateTime),
        notes: formNotes.trim() || undefined,
        tableId: editTarget.status === "checked_in" ? undefined : formTableId || null,
        eventType: formEventType || null,
      },
      editTarget,
    );
    setBusyId(null);
    if (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
      return;
    }
    setEditTarget(null);
    void loadReservations();
  };

  const handleAssign = async () => {
    if (!assignTarget || assignTableIds.length === 0) return;

    const snapshot = await fetchReservationSnapshot(assignTarget.id);
    if (!snapshot) {
      setError(translate("resUndoFailed"));
      return;
    }

    setBusyId(assignTarget.id);
    const { error: assignError } = await assignReservationTables(assignTarget.id, assignTableIds, {
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
    setAssignTableIds([]);
    void loadReservations();
  };

  const handleCheckIn = async () => {
    if (!checkInTarget || checkInTableIds.length === 0) return;

    const snapshot = await fetchReservationSnapshot(checkInTarget.id);
    if (!snapshot) {
      setError(translate("resUndoFailed"));
      return;
    }

    const tableSnapshots: Awaited<ReturnType<typeof fetchTableSnapshot>>[] = [];
    if (!checkInOccupied) {
      for (const tableId of checkInTableIds) {
        const snap = await fetchTableSnapshot(tableId);
        if (snap) tableSnapshots.push(snap);
      }
    }

    const { data: visitProfile } = await fetchGuestVisitProfile({
      email: checkInTarget.guestEmail,
      phone: checkInTarget.guestPhone,
      excludeReservationId: checkInTarget.id,
      beforeAt: checkInTarget.reservedAt,
    });

    setBusyId(checkInTarget.id);
    const actualParty = Math.max(1, checkInActualParty || checkInTarget.partySize);
    const { error: checkInError } = await checkInReservationWithTables(
      checkInTarget.id,
      checkInTableIds,
      { allowOccupied: checkInOccupied, actualPartySize: actualParty },
    );
    setBusyId(null);

    if (checkInError) {
      setError(checkInError instanceof Error ? checkInError.message : String(checkInError));
      return;
    }

    const labels = checkInTableIds
      .map((id) => tables.find((table) => table.id === id)?.label)
      .filter(Boolean);
    void sendCfdEvent("GUEST_WELCOME", {
      reservationId: checkInTarget.id,
      guestName: checkInTarget.guestName,
      isReturning: visitProfile.isReturning,
      tableLabel: labels.join(" · ") || checkInTarget.tableLabel || null,
    });

    queueUndo({
      id: `${checkInTarget.id}-checkin-${Date.now()}`,
      action: "check_in",
      reservation: snapshot,
      tables: tableSnapshots.filter((row): row is NonNullable<typeof row> => row != null),
    });
    setCheckInTarget(null);
    setCheckInTableIds([]);
    setCheckInActualParty(2);
    void loadReservations();
    onRefreshTables?.();
  };

  const handleCancelReservation = async () => {
    if (!cancelTarget) return;
    if (!cancelReason) {
      setError(translate("resCancelReasonRequired"));
      return;
    }
    if (cancelReason === "other" && !cancelNote.trim()) {
      setError(translate("resCancelNoteRequired"));
      return;
    }

    const snapshot = await fetchReservationSnapshot(cancelTarget.id);
    if (!snapshot) {
      setError(translate("resUndoFailed"));
      return;
    }

    setBusyId(cancelTarget.id);
    const { error: cancelError, emailSent, emailError } = await cancelReservationWithEmail(
      cancelTarget.id,
      {
        cancelledBy: currentStaffUser?.name || currentStaffUser?.id || "staff",
        cancellationReason: cancelReason,
        cancellationNote: cancelReason === "other" ? cancelNote.trim() : cancelNote.trim() || undefined,
      },
    );
    setBusyId(null);

    if (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
      return;
    }

    if (!cancelTarget.guestEmail) {
      pushNotification({ message: translate("resCancelEmailSkipped"), playSound: false });
    } else if (emailSent) {
      pushNotification({ message: translate("resCancelEmailSent"), playSound: false });
    } else {
      pushNotification({
        message: `${translate("resCancelEmailFailed")}${emailError ? `: ${emailError}` : ""}`,
        playSound: false,
      });
    }

    queueUndo({
      id: `${cancelTarget.id}-cancel-${Date.now()}`,
      action: "cancel",
      reservation: snapshot,
    });
    setCancelTarget(null);
    setCancelReason("");
    setCancelNote("");
    void loadReservations();
  };

  const openCancelDialog = (row: ReservationRecord) => {
    setError(null);
    setCancelTarget(row);
    setCancelReason("");
    setCancelNote("");
  };

  const handleMarkNoShow = async (row: ReservationRecord) => {
    const confirmed = window.confirm(
      translate("confirmMarkNoShow").replace("{name}", row.guestName),
    );
    if (!confirmed) return;
    await runAction(row.id, () => markNoShowWithEmail(row.id));
  };

  const formatDateTime = (date: Date) =>
    date.toLocaleString(language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB", {
      timeZone: "Europe/Prague",
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
    <div className="flex h-full flex-col bg-background text-[var(--foreground)]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--pos-raised)] px-2 py-1.5 sm:gap-3 sm:px-4 sm:py-2 lg:px-6">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <h1 className="pos-header-title shrink-0">{translate("reservations")}</h1>
          <HeaderClockWithStatus />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setShowCapacityModal(true)}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 sm:gap-1.5 sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-xs"
          >
            <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {translate("resCapacityOpenButton")}
          </button>
          <button
            type="button"
            onClick={() => {
              setFormSource("reservation");
              setShowNewModal(true);
            }}
            className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-[11px] font-semibold text-white dark:bg-gray-100 dark:text-gray-900 sm:gap-1.5 sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-xs"
          >
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {translate("newReservation")}
          </button>
        </div>
      </header>

      <Modal
        open={showCapacityModal}
        onClose={() => setShowCapacityModal(false)}
        title={translate("resCapacityOverviewTitle")}
        size="xl"
        bodyClassName="px-4 py-4 sm:px-6"
      >
        {showCapacityModal ? (
          <ReservationCapacityOverview
            dateIso={capacityDateIso}
            refreshKey={capacityRefreshKey}
            floorOccupiedCount={floorOccupiedCount}
            active={showCapacityModal}
            inModal
          />
        ) : null}
      </Modal>

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
                      {(() => {
                        const submittedAt =
                          row.guestSubmittedAt ??
                          (row.source === "online" ? row.createdAt : undefined);
                        const changedAt = row.guestChangedAt;
                        if (!submittedAt && !changedAt) return null;
                        return (
                          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-gray-500 dark:text-gray-400 sm:text-xs">
                            {submittedAt ? (
                              <span>
                                {translate("resGuestSubmittedAt")}: {formatDateTime(submittedAt)}
                              </span>
                            ) : null}
                            {changedAt ? (
                              <span>
                                {translate("resGuestChangedAt")}: {formatDateTime(changedAt)}
                              </span>
                            ) : null}
                          </p>
                        );
                      })()}
                      {formatReservationTableLabels(row) ? (
                        <p
                          className={`mt-1 inline-flex items-center gap-1 text-sm font-medium ${
                            row.status === "checked_in"
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "text-gray-600 dark:text-gray-300"
                          }`}
                        >
                          <MapPin className="h-4 w-4" />
                          {row.status === "checked_in"
                            ? `${translate("table")} ${formatReservationTableLabels(row)}`
                            : `${translate("resTablePlanned")}: ${formatReservationTableLabels(row)}`}
                        </p>
                      ) : row.suggestedSeating ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                          <MapPin className="h-4 w-4" />
                          {translate("resSuggestedSeating")}: {row.suggestedSeating}
                          {row.suggestedCapacity ? ` · ${row.suggestedCapacity}` : ""}
                        </p>
                      ) : null}
                      {row.capacityStatus ? (
                        <p className="mt-1">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                              row.capacityStatus === "full"
                                ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200"
                                : row.capacityStatus === "limited"
                                  ? "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
                                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                            }`}
                          >
                            {translate("resCapacityWarning")}:{" "}
                            {row.capacityStatus === "full"
                              ? translate("resCapacityFull")
                              : row.capacityStatus === "limited"
                                ? translate("resCapacityLimited")
                                : translate("resCapacityAvailable")}
                            {row.staffOverrideCapacity ? ` · ${translate("resStaffOverride")}` : ""}
                          </span>
                        </p>
                      ) : null}
                      {row.capacityWarnings ? (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          {row.capacityWarnings}
                        </p>
                      ) : null}
                      {row.status === "cancelled" && row.cancellationReason ? (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {translate("resCancelReasonTitle")}: {row.cancellationReason}
                          {row.cancelledBy ? ` · ${row.cancelledBy}` : ""}
                          {row.cancelEmailStatus ? ` · ${row.cancelEmailStatus}` : ""}
                        </p>
                      ) : null}
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
                      {(() => {
                        const { bbq, noteText } = parseReservationBbqNotes(row.notes);
                        // BBQ / Casual only — no badge when guest answered "I don't know".
                        const bbqLabel =
                          bbq === "yes"
                            ? translate("mapResTickerBbqYes")
                            : bbq === "no"
                              ? translate("mapResTickerBbqNo")
                              : null;
                        return (
                          <>
                            {bbq && bbqLabel ? (
                              <p className="mt-1">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                                    bbq === "yes"
                                      ? "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200"
                                      : bbq === "no"
                                        ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                                  }`}
                                >
                                  {bbqLabel}
                                </span>
                              </p>
                            ) : null}
                            {noteText ? (
                              <p className="mt-1 text-sm italic text-gray-500">{noteText}</p>
                            ) : null}
                          </>
                        );
                      })()}
                      <GuestReturningBadge
                        email={row.guestEmail}
                        phone={row.guestPhone}
                        excludeReservationId={row.id}
                        beforeAt={row.reservedAt}
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
                            setCheckInTableIds(
                              [row.tableId, row.secondaryTableId, row.tertiaryTableId].filter(
                                Boolean,
                              ) as string[],
                            );
                            setCheckInActualParty(row.actualPartySize ?? row.partySize);
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
                            setAssignTableIds(
                              [row.tableId, row.secondaryTableId, row.tertiaryTableId].filter(
                                Boolean,
                              ) as string[],
                            );
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
                          onClick={() => openCancelDialog(row)}
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
          setFormSource("reservation");
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
                posLabel={translate("resSourceReservation")}
                phoneLabel={translate("resSourcePhoneCall")}
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
            ) : formatReservationTableLabels(editTarget) ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {translate("table")} {formatReservationTableLabels(editTarget)}
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
              className="w-full rounded-xl bg-[var(--pos-brand)] py-3 text-sm font-semibold text-white hover:bg-[var(--pos-brand-hover)] disabled:opacity-50"
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
          <p className="text-xs text-gray-500 dark:text-gray-400">{translate("assignTableHint")}</p>
          <ReservationDualTableSelect
            tables={tables}
            value={assignTableIds}
            onChange={setAssignTableIds}
          />
          {assignOccupied ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {translate("tableOccupiedWarning")}
            </p>
          ) : null}
          <button type="button" disabled={assignTableIds.length === 0 || busyId === assignTarget?.id} onClick={() => void handleAssign()} className="w-full rounded-xl bg-[var(--pos-brand)] py-3 text-sm font-semibold text-white hover:bg-[var(--pos-brand-hover)] disabled:opacity-50">
            {translate("assignTable")}
          </button>
        </div>
      </Modal>

      <Modal
        open={checkInTarget !== null}
        onClose={() => {
          setCheckInTarget(null);
          setCheckInTableIds([]);
          setCheckInActualParty(2);
        }}
        title={translate("checkIn")}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {checkInTarget?.guestName} · {checkInTarget?.partySize} {translate("partySize").toLowerCase()}
            {checkInTarget?.suggestedSeating
              ? ` · ${translate("resSuggestedSeating")}: ${checkInTarget.suggestedSeating}`
              : ""}
          </p>
          <PartySizeStepper
            value={checkInActualParty}
            onChange={setCheckInActualParty}
            max={settings.reservationMaxGuestsPerSlot || 50}
            label={translate("resActualPartySize")}
          />
          <ReservationDualTableSelect
            tables={tables}
            value={checkInTableIds}
            onChange={setCheckInTableIds}
            className="pos-input"
          />
          {checkInOccupied ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {translate("tableOccupiedWarning")}
            </p>
          ) : null}
          <button
            type="button"
            disabled={checkInTableIds.length === 0 || busyId === checkInTarget?.id}
            onClick={() => void handleCheckIn()}
            className="w-full rounded-xl bg-[var(--pos-brand)] py-3 text-sm font-semibold text-white hover:bg-[var(--pos-brand-hover)] disabled:opacity-50"
          >
            {translate("checkIn")}
          </button>
        </div>
      </Modal>

      <Modal
        open={cancelTarget !== null}
        onClose={() => {
          setCancelTarget(null);
          setCancelReason("");
          setCancelNote("");
        }}
        title={translate("resCancelReasonTitle")}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {cancelTarget?.guestName}
            {cancelTarget
              ? ` · ${cancelTarget.partySize} ${translate("partySize").toLowerCase()}`
              : ""}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{translate("resCancelReasonHint")}</p>
          <div className="space-y-2">
            {RESERVATION_CANCEL_REASONS.map((reason) => (
              <label
                key={reason.id}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  cancelReason === reason.id
                    ? "border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950/30"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <input
                  type="radio"
                  name="cancel-reason"
                  checked={cancelReason === reason.id}
                  onChange={() => setCancelReason(reason.id)}
                  className="mt-1"
                />
                <span>
                  {reason.id === "capacity"
                    ? translate("resCancelReasonCapacity")
                    : reason.id === "closed"
                      ? translate("resCancelReasonClosed")
                      : reason.id === "time"
                        ? translate("resCancelReasonTime")
                        : reason.id === "info"
                          ? translate("resCancelReasonInfo")
                          : reason.id === "customer"
                            ? translate("resCancelReasonCustomer")
                            : reason.id === "duplicate"
                              ? translate("resCancelReasonDuplicate")
                              : translate("resCancelReasonOther")}
                </span>
              </label>
            ))}
          </div>
          <label className="block text-sm">
            <span className="text-gray-500">{translate("resCancelNoteLabel")}</span>
            <textarea
              value={cancelNote}
              onChange={(event) => setCancelNote(event.target.value)}
              className="pos-input mt-1 min-h-[72px]"
            />
          </label>
          <button
            type="button"
            disabled={!cancelReason || busyId === cancelTarget?.id}
            onClick={() => void handleCancelReservation()}
            className="w-full rounded-xl bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {translate("resCancelConfirmFinal")}
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
