"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Eye, MapPin, ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
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
  isAnyOccupiedTable,
} from "@/components/reservation-table-select";
import { ReservationTableMap } from "@/components/reservation-table-map";
import { ReservationBookingView, type ReservationStaffDraft } from "@/components/reservation-booking-view";
import { splitVenueWallTime, venueWallTimeToUtc } from "@/lib/venue-timezone";
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
import { formatReservationTableLabels, reservationTableLabels } from "@/lib/reservation-tables";
import { fetchGuestVisitProfile } from "@/src/lib/guest-history-actions";
import { sendCfdEvent } from "@/lib/cfd-display";
import {
  RESERVATION_CANCEL_REASONS,
  type ReservationCancelReasonId,
} from "@/lib/reservation-cancel-reasons";
import { ReservationCapacityOverview } from "@/components/reservation-capacity-overview";
import { TableAvailabilityDashboard } from "@/components/table-availability-dashboard";

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
  const parts = splitVenueWallTime(date.toISOString());
  return `${parts.date}T${parts.time}`;
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

const STATUS_FILTER_OPTIONS: { value: ReservationStatusFilter; labelKey: "resFilterAll" | "resFilterPending" | "resFilterConfirmed" | "resFilterLate" | "resFilterCheckedIn" | "resFilterNoShow" | "resFilterCompleted" | "resFilterCancelled" }[] = [
  { value: "all", labelKey: "resFilterAll" },
  { value: "pending", labelKey: "resFilterPending" },
  { value: "confirmed", labelKey: "resFilterConfirmed" },
  { value: "late", labelKey: "resFilterLate" },
  { value: "checked_in", labelKey: "resFilterCheckedIn" },
  { value: "no_show", labelKey: "resFilterNoShow" },
  { value: "completed", labelKey: "resFilterCompleted" },
  { value: "cancelled", labelKey: "resFilterCancelled" },
];

const LATE_SLA_INTERVAL_MS = 60_000;

interface ReservationsViewProps {
  tables: RestaurantTable[];
  onRefreshTables?: () => void;
}

export function ReservationsView({ tables, onRefreshTables }: ReservationsViewProps) {
  const { translate, language, currentStaffUser } = useApp();
  const { settings, saveSettings, saving: savingSettings, loading: loadingSettings, error: settingsError } = useSettings();
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
  const [detailsId,setDetailsId]=useState<string|null>(null);
  const detailsTarget=reservations.find(row=>row.id===detailsId)??null;
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
  const [assignConflict, setAssignConflict] = useState<{ reservationId: string; tableId: string; reason: string } | null>(null);
  const [checkInTableIds, setCheckInTableIds] = useState<string[]>([]);
  const [checkInConflict, setCheckInConflict] = useState<{ reservationId: string; tableId: string; partySize: number; reason: string } | null>(null);
  const [undoEntry, setUndoEntry] = useState<ReservationUndoEntry | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [capacityRefreshKey, setCapacityRefreshKey] = useState(0);
  const [reservationsConnected, setReservationsConnected] = useState(false);
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
    let hasConnected = false;
    const unsub = subscribeToReservationChanges({
      onChange: () => void loadReservations(),
      onConnectionChange: (connected) => {
        setReservationsConnected(connected);
        if (connected && hasConnected) void loadReservations();
        if (connected) hasConnected = true;
      },
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

  const dateNavLocale = language === "cs" ? "cs-CZ" : language === "vi" ? "vi-VN" : "en-GB";

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

  const handleCreateReservation = async (draft:ReservationStaffDraft):Promise<string|null> => {
    setBusyId("new");
    try {
      const bbqTag=draft.wantsBbq?`[BBQ: ${draft.wantsBbq==="yes"?"Yes":draft.wantsBbq==="no"?"No":"Undecided"}]`:"";
      const { data:created,error:createError }=await createReservation({
        guestName:draft.guestName|| (language==="cs"?"Host":language==="vi"?"Khách":"Guest"),
        guestPhone:draft.phone||undefined,guestEmail:draft.email||undefined,
        partySize:Math.max(1,draft.guestCount),reservedAt:venueWallTimeToUtc(draft.date,draft.time),
        notes:[bbqTag,draft.notes].filter(Boolean).join(" ")||undefined,
        eventType:draft.eventType||undefined,referralCode:draft.referralCode||undefined,
        tableId:formTableId||undefined,staffId:currentStaffUser?.id,staffName:currentStaffUser?.name,source:formSource,
      });
      if(createError)return createError.message;
      if(draft.email&&created?.id){
        void fetch("/api/reservations/notify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:created.id,type:"received"})}).catch(()=>undefined);
      }
      setShowNewModal(false);
      setFormTableId("");setFormSource("reservation");
      void loadReservations();
      return null;
    } finally {setBusyId(null);}
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
        reservedAt: venueWallTimeToUtc(formDateTime.slice(0,10),formDateTime.slice(11,16)),
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

  const handleAssign = async (override = false) => {
    if (!assignTarget || busyId === assignTarget.id) return;
    if (override && (!assignConflict || assignConflict.reservationId !== assignTarget.id || assignConflict.tableId !== assignTableIds[0])) return;

    setBusyId(assignTarget.id);
    const snapshot = await fetchReservationSnapshot(assignTarget.id);
    if (!snapshot) {
      setBusyId(null);
      setError(translate("resUndoFailed"));
      return;
    }

    const { error: assignError } = await assignReservationTables(assignTarget.id, assignTableIds, {
      allowOccupied: assignOccupied,
      override, overrideReason: override ? assignConflict?.reason : undefined,
    });
    setBusyId(null);

    if (assignError) {
      const reason = assignError instanceof Error ? assignError.message : String(assignError);
      setError(reason);
      setAssignConflict(!override && (assignError as { message?: string; overrideAllowed?: boolean }).overrideAllowed === true
        ? { reservationId: assignTarget.id, tableId: assignTableIds[0], reason } : null);
      return;
    }

    queueUndo({
      id: `${assignTarget.id}-assign-${Date.now()}`,
      action: "assign",
      reservation: snapshot,
    });
    setAssignTarget(null);
    setAssignConflict(null);
    setAssignTableIds([]);
    void loadReservations();
  };

  const handleCheckIn = async (override = false) => {
    if (!checkInTarget || !checkInTableIds.length || busyId === checkInTarget.id) return;
    if (override && (!checkInConflict || checkInConflict.reservationId !== checkInTarget.id
      || checkInConflict.tableId !== checkInTableIds[0] || checkInConflict.partySize !== checkInActualParty)) return;

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

    setBusyId(checkInTarget.id);
    const { data: visitProfile } = await fetchGuestVisitProfile({
      email: checkInTarget.guestEmail,
      phone: checkInTarget.guestPhone,
      excludeReservationId: checkInTarget.id,
      beforeAt: new Date(),
    });

    const actualParty = Math.max(1, checkInActualParty || checkInTarget.partySize);
    const { error: checkInError } = await checkInReservationWithTables(
      checkInTarget.id,
      checkInTableIds,
      { allowOccupied: false, actualPartySize: actualParty, override, overrideReason: override ? checkInConflict?.reason : undefined },
    );
    setBusyId(null);

    if (checkInError) {
      const reason = checkInError instanceof Error ? checkInError.message : String(checkInError);
      setError(reason);
      setCheckInConflict(!override && (checkInError as { message?: string; overrideAllowed?: boolean }).overrideAllowed === true
        ? { reservationId: checkInTarget.id, tableId: checkInTableIds[0], partySize: actualParty, reason } : null);
      onRefreshTables?.();
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
    setCheckInConflict(null);
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
    date.toLocaleString(language === "cs" ? "cs-CZ" : language === "vi" ? "vi-VN" : "en-GB", {
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
      ? "rounded-2xl border border-orange-400/60 bg-orange-50 p-4 shadow-sm dark:bg-orange-950/20 sm:p-5"
      : "rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-colors hover:border-[#C9A88B]/40 sm:p-5";

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
              setFormTableId("");
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
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C9A88B]/25 bg-[var(--card)] px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">{translate("resBookingLimits")}</h2>
              <p id="booking-limits-hint" className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
                {translate(settings.reservationCapacityLimitsEnabled ? "resBookingLimitsEnabledHint" : "resBookingLimitsDisabledHint")}
              </p>
              {settingsError && <p role="alert" className="mt-1 text-xs text-red-500">{settingsError}</p>}
            </div>
            <button type="button" role="switch" aria-checked={settings.reservationCapacityLimitsEnabled}
              aria-label={translate("resBookingLimits")} aria-describedby="booking-limits-hint"
              disabled={savingSettings || loadingSettings}
              onClick={async () => {
                if (await saveSettings({ reservationCapacityLimitsEnabled: !settings.reservationCapacityLimitsEnabled })) {
                  setCapacityRefreshKey((key) => key + 1);
                }
              }}
              className="inline-flex min-h-11 shrink-0 items-center gap-3 rounded-xl border border-[#C9A88B]/25 px-3 py-2 text-xs font-semibold transition-colors hover:bg-[#C9A88B]/10 disabled:cursor-wait disabled:opacity-50">
              <span className={settings.reservationCapacityLimitsEnabled ? "text-emerald-500" : "text-amber-500"}>
                {translate(settings.reservationCapacityLimitsEnabled ? "resBookingLimitsEnabled" : "resBookingLimitsDisabled")}
              </span>
              <span aria-hidden className={`relative h-6 w-11 rounded-full transition-colors ${settings.reservationCapacityLimitsEnabled ? "bg-emerald-600" : "bg-stone-500/60"}`}>
                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${settings.reservationCapacityLimitsEnabled ? "translate-x-5" : "translate-x-0"}`} />
              </span>
            </button>
          </section>
          <TableAvailabilityDashboard tables={tables} reservations={reservations} language={language} staff realtimeConnected={reservationsConnected} refreshKey={capacityRefreshKey} />
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 sm:px-5">
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

          <section className="grid grid-cols-2 gap-3">
            {(
              [
                { label: "resTotalGuests" as const, value: stats.totalGuests },
                { label: "resTotalTables" as const, value: stats.totalBookings },
              ] as const
            ).map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-800 sm:p-3"
              >
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)] sm:text-xs">
                  {translate(label)}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--foreground)] sm:text-3xl">{value}</p>
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
                  <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(140px,0.65fr)_minmax(220px,0.8fr)]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold sm:text-base lg:text-lg"><button type="button" onClick={()=>setDetailsId(row.id)} className="text-left transition-colors hover:text-[#C9A88B] focus-visible:rounded focus-visible:outline-2 focus-visible:outline-[#C9A88B]" aria-label={`${translate("resGuestDetails")}: ${row.guestName}`}>{row.guestName}</button>{row.referralCode && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{row.referralCode}</span>}</h2>
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
                            language==="cs"?"cs":language==="vi"?"vi":"en",
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
                              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--muted)]">{noteText}</p>
                            ) : null}
                          </>
                        );
                      })()}
                      <GuestReturningBadge
                        email={row.guestEmail}
                        phone={row.guestPhone}
                        excludeReservationId={row.id}
                        beforeAt={row.checkedInAt ?? row.reservedAt}
                      />
                    </div>

                    <div className={reservationTableLabels(row).length?"flex min-w-0 items-center justify-center":"hidden lg:block"}>
                      {reservationTableLabels(row).length>0&&<div className={`cfd-fade-enter w-full rounded-2xl border px-4 py-3 text-center ${row.status==="checked_in"?"border-emerald-400/30 bg-emerald-500/5":"border-[#C9A88B]/30 bg-[#C9A88B]/5"}`}>
                        <p className="mb-2 flex items-center justify-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]"><MapPin className="h-3 w-3"/>{row.status==="checked_in"?translate("table"):translate("resTablePlanned")}</p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {reservationTableLabels(row).map(label=><span key={label} className="rounded-xl border border-[#C9A88B]/20 bg-[#C9A88B]/10 px-3 py-2 text-2xl font-semibold tracking-wide text-[var(--foreground)]">{label}</span>)}
                        </div>
                      </div>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <button type="button" onClick={()=>setDetailsId(row.id)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[#C9A88B]/30 bg-[#C9A88B]/5 px-3 py-2 text-xs font-medium transition hover:bg-[#C9A88B]/15">
                        <Eye className="h-3.5 w-3.5" aria-hidden/>{translate("resGuestDetails")}
                      </button>
                      {canEditReservation(row.status) && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => openEditModal(row)}
                          aria-label={translate("editReservation")}
                          title={translate("editReservation")}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted)] transition hover:bg-[var(--accent)] disabled:opacity-50"
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
                            setCheckInConflict(null);
                            setError(null);
                            setCheckInTableIds(
                              [row.tableId, row.secondaryTableId, row.tertiaryTableId].filter(
                                Boolean,
                              ) as string[],
                            );
                            setCheckInActualParty(row.actualPartySize ?? row.partySize);
                          }}
                          className="min-h-9 rounded-xl bg-[#C9A88B] px-3 py-2 text-xs font-semibold text-[#171211] transition hover:bg-[#DCC1A5] disabled:opacity-50"
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
                            setAssignConflict(null);
                            setError(null);
                            setAssignTableIds(
                              [row.tableId, row.secondaryTableId, row.tertiaryTableId].filter(
                                Boolean,
                              ) as string[],
                            );
                          }}
                          className="min-h-9 rounded-xl border border-[#C9A88B]/40 bg-[#C9A88B]/5 px-3 py-2 text-xs font-medium transition hover:bg-[#C9A88B]/15 disabled:opacity-50"
                        >
                          {translate("assignTable")}
                        </button>
                      )}
                      {canMarkNoShow(row.status) && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void handleMarkNoShow(row)}
                          className="min-h-9 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-500/15 dark:text-amber-200 disabled:opacity-50"
                        >
                          {translate("markNoShow")}
                        </button>
                      )}
                      {canCancelReservation(row.status) && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => openCancelDialog(row)}
                          className="min-h-9 rounded-xl border border-red-400/25 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-500/15 dark:text-red-300 disabled:opacity-50"
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

      <Modal open={detailsTarget!==null} onClose={()=>setDetailsId(null)} title={translate("resGuestDetails")} size="lg">
        {detailsTarget&&<div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
            <h3 className="pos-serif break-words text-2xl text-[var(--foreground)]">{detailsTarget.guestName}</h3>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${reservationStatusTone(detailsTarget.status)}`}>{translate(reservationStatusLabelKey(detailsTarget.status))}</span>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-[var(--muted)]">{translate("guestPhone")}</dt><dd className="mt-1 break-words font-medium">{detailsTarget.guestPhone?<a href={`tel:${detailsTarget.guestPhone.replace(/[^\d+]/g,"")}`} className="hover:text-[#C9A88B]">{detailsTarget.guestPhone}</a>:"—"}</dd></div>
            <div><dt className="text-xs text-[var(--muted)]">{translate("guestEmail")}</dt><dd className="mt-1 break-words font-medium">{detailsTarget.guestEmail?<a href={`mailto:${detailsTarget.guestEmail}`} className="hover:text-[#C9A88B]">{detailsTarget.guestEmail}</a>:"—"}</dd></div>
            {[
              [translate("reservedAt"),formatDateTime(detailsTarget.reservedAt)],
              [translate("bookingCode"),detailsTarget.bookingCode],
              [translate("partySize"),String(detailsTarget.partySize)],
              [translate("resActualPartySize"),detailsTarget.actualPartySize?.toString()],
              [translate("table"),formatReservationTableLabels(detailsTarget)],
              [translate("resReferralCode"),detailsTarget.referralCode],
              [translate("reservationSource"),translate(({reservation:"resSourceReservation",phone_call:"resSourcePhoneCall",online:"resSourceOnline",walk_in:"resSourceWalkIn"} as const)[detailsTarget.source])],
              [translate("resEventType"),settings.reservationEventTypes.find(option=>option.id===detailsTarget.eventType)?pickEventTypeLabel(settings.reservationEventTypes.find(option=>option.id===detailsTarget.eventType)!,language==="cs"?"cs":language==="vi"?"vi":"en"):detailsTarget.eventType],
              [translate("checkIn"),detailsTarget.checkedInAt?formatDateTime(detailsTarget.checkedInAt):undefined],
              [translate("resStatusCompleted"),detailsTarget.completedAt?formatDateTime(detailsTarget.completedAt):undefined],
              [translate("staff"),detailsTarget.staffName],
            ].map(([label,value])=><div key={label}><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 break-words font-medium">{value||"—"}</dd></div>)}
          </dl>
          {(()=>{
            const parsed=parseReservationBbqNotes(detailsTarget.notes);
            const bbq=detailsTarget.wantsGrill??parsed.bbq;
            return <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--accent)]/30 p-4">
              {bbq&&<p className="text-xs font-semibold text-[#C9A88B]">{bbq==="yes"?translate("mapResTickerBbqYes"):bbq==="no"?translate("mapResTickerBbqNo"):translate("resBbqUndecided")}</p>}
              <p className="text-xs text-[var(--muted)]">{translate("resNotes")}</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{parsed.noteText||"—"}</p>
            </div>;
          })()}
          {detailsTarget.status==="cancelled"&&<div className="space-y-2 rounded-2xl border border-red-400/20 bg-red-500/5 p-4 text-sm">
            <p className="font-semibold text-red-700 dark:text-red-200">{translate("resStatusCancelled")}</p>
            {(detailsTarget.cancelledAt||detailsTarget.cancelledBy)&&<p className="text-xs text-[var(--muted)]">{[detailsTarget.cancelledAt?formatDateTime(detailsTarget.cancelledAt):null,detailsTarget.cancelledBy].filter(Boolean).join(" · ")}</p>}
            {detailsTarget.cancellationReason&&<p>{detailsTarget.cancellationReason}</p>}
            {detailsTarget.cancellationNote&&<div><p className="text-xs text-[var(--muted)]">{translate("resCancelNoteLabel")}</p><p className="mt-1 whitespace-pre-wrap break-words">{detailsTarget.cancellationNote}</p></div>}
          </div>}
          <button type="button" onClick={()=>setDetailsId(null)} className="min-h-11 w-full rounded-xl border border-[var(--border)] text-sm font-medium transition hover:bg-[var(--accent)]">{translate("close")}</button>
        </div>}
      </Modal>

      <Modal
        open={showNewModal}
        onClose={()=>{if(busyId!=="new"){setFormSource("reservation");setShowNewModal(false);}}}
        title={translate("newReservation")}
        size="xl"
      >
        {showNewModal&&<ReservationBookingView embedded staff={{
          settings,language:language==="cs"?"cs":language==="vi"?"vi":"en",submitLabel:translate("saveReservation"),onSubmit:handleCreateReservation,
          fields:<div className="space-y-4 border-t border-white/10 pt-4">
            <div className="space-y-2 text-sm text-white/70">
              <p>{translate("reservationSource")}</p>
              <ReservationSourcePicker value={formSource} onChange={setFormSource} posLabel={translate("resSourceReservation")} phoneLabel={translate("resSourcePhoneCall")}/>
            </div>
            <ReservationTableMap tables={tables} language={language} value={formTableId?[formTableId]:[]} onChange={ids=>setFormTableId(ids[0]??"")} maxTables={1} allowOccupied={false} disabled={busyId==="new"}/>
          </div>,
        }}/>} 
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
                      {pickEventTypeLabel(option, language === "cs" ? "cs" : language === "vi" ? "vi" : "en")}
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

      <Modal open={assignTarget !== null} onClose={() => { if (busyId !== assignTarget?.id) { setAssignTarget(null); setAssignConflict(null); } }} title={translate("assignTable")} size="xl">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {assignTarget?.guestName} · {assignTarget?.partySize} {translate("partySize").toLowerCase()}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{translate("assignTableHint")}</p>
          <ReservationTableMap
            tables={tables}
            allowOccupied
            allowBlocked
            value={assignTableIds}
            onChange={(ids) => { setAssignTableIds(ids); setAssignConflict(null); setError(null); }}
            language={language}
            disabled={busyId===assignTarget?.id}
          />
          {assignOccupied ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {translate("tableOccupiedWarning")}
            </p>
          ) : null}
          {assignConflict && assignTarget && assignConflict.reservationId === assignTarget.id && assignConflict.tableId === assignTableIds[0] && <div role="alert" className="space-y-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-3 text-sm text-amber-800 dark:text-amber-100">
            <p>{assignConflict.reason}</p><p className="text-xs opacity-75">{translate("assignOverrideHint")}</p>
            <button type="button" disabled={busyId === assignTarget?.id} onClick={() => void handleAssign(true)} className="min-h-10 rounded-lg bg-amber-300 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-40">{translate("assignOverrideContinue")}</button>
          </div>}
          <button type="button" disabled={busyId === assignTarget?.id || (assignTableIds.length === 0 && !assignTarget?.tableId && !assignTarget?.secondaryTableId && !assignTarget?.tertiaryTableId)} onClick={() => void handleAssign()} className="w-full rounded-xl bg-[var(--pos-brand)] py-3 text-sm font-semibold text-white hover:bg-[var(--pos-brand-hover)] disabled:opacity-50">
            {translate(assignTableIds.length ? "assignTable" : "unassignTable")}
          </button>
        </div>
      </Modal>

      <Modal
        open={checkInTarget !== null}
        onClose={() => {
          setCheckInTarget(null);
          setCheckInConflict(null);
          setCheckInTableIds([]);
          setCheckInActualParty(2);
        }}
        title={translate("checkIn")}
        size="xl"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {checkInTarget?.guestName} · {checkInTarget?.partySize} {translate("partySize").toLowerCase()}
          </p>
          <PartySizeStepper
            value={checkInActualParty}
            onChange={(count) => { setCheckInActualParty(count); setCheckInConflict(null); setError(null); }}
            max={settings.reservationMaxGuestsPerSlot || 50}
            label={translate("resActualPartySize")}
          />
          <ReservationTableMap
            tables={tables}
            value={checkInTableIds}
            maxTables={3}
            allowOccupied={false}
            allowBlocked
            checkIn={checkInTarget?{reservation:checkInTarget,reservations,partySize:checkInActualParty,durationMinutes:settings.reservationDurationMinutes,bufferMinutes:settings.reservationBufferMinutes}:undefined}
            onChange={(ids) => { setCheckInTableIds(ids); setCheckInConflict(null); setError(null); }}
            language={language}
            disabled={busyId===checkInTarget?.id}
          />
          {checkInOccupied ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {translate("tableOccupiedWarning")}
            </p>
          ) : null}
          {checkInConflict && checkInTarget && checkInConflict.reservationId === checkInTarget.id
            && checkInConflict.tableId === checkInTableIds[0] && checkInConflict.partySize === checkInActualParty && <div role="alert" className="space-y-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-800 dark:text-amber-100">
              <p>{checkInConflict.reason}</p><p className="text-xs opacity-75">{translate("checkInOverrideHint")}</p>
              <button type="button" disabled={busyId === checkInTarget.id} onClick={() => void handleCheckIn(true)} className="min-h-10 rounded-lg bg-amber-300 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-40">{translate("checkInOverrideContinue")}</button>
            </div>}
          {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
          <button
            type="button"
            disabled={!checkInTableIds.length || checkInOccupied || busyId === checkInTarget?.id}
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
