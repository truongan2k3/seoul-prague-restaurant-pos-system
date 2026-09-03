"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { GuestReturningBadge } from "@/components/guest-returning-badge";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { playCustomAlertSound } from "@/lib/notification-sound";
import { pickEventTypeLabel } from "@/lib/reservation-guest-form";
import {
  guestAlertToReservationRecord,
  type GuestReservationAlertPayload,
} from "@/lib/reservation-guest-alert";
import type { ReservationRecord } from "@/lib/types";
import type { GuestVisitProfile } from "@/src/lib/guest-history-actions";
import { fetchGuestVisitProfile } from "@/src/lib/guest-history-actions";
import {
  fetchReservations,
  mapReservationsResponse,
  markLateReservations,
  subscribeToGuestReservationAlerts,
  subscribeToReservationChanges,
} from "@/src/lib/reservation-actions";

type ScreenAlert =
  | { kind: "new"; reservation: ReservationRecord }
  | {
      kind: "updated";
      reservation: ReservationRecord;
      previous?: GuestReservationAlertPayload["previous"];
    }
  | { kind: "cancelled"; reservation: ReservationRecord };

async function confirmReservationWithEmail(reservationId: string) {
  const response = await fetch("/api/reservations/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: reservationId }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    return { error: payload.error || "Failed to confirm reservation" };
  }
  return { error: null };
}

/** Popup on main POS when a guest books, updates, or cancels online. */
export function ReservationIncomingListener() {
  const { translate, language, soundMainEnabled } = useApp();
  const { settings } = useSettings();
  const [alert, setAlert] = useState<ScreenAlert | null>(null);
  const [visitProfile, setVisitProfile] = useState<GuestVisitProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const readyRef = useRef(false);
  const queueRef = useRef<ScreenAlert[]>([]);
  const alertRef = useRef<ScreenAlert | null>(null);

  const formatDateTime = useCallback(
    (date: Date | string) =>
      new Date(date).toLocaleString(
        language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB",
        {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        },
      ),
    [language],
  );

  const playAlertSound = useCallback(() => {
    if (!soundMainEnabled) return;
    const soundUrl = settings.soundConfigs.newOrder || settings.soundConfigs.mainNewOrder;
    playCustomAlertSound(soundUrl, "newOrder");
  }, [settings.soundConfigs.mainNewOrder, settings.soundConfigs.newOrder, soundMainEnabled]);

  const showNext = useCallback((next: ScreenAlert | null) => {
    alertRef.current = next;
    setAlert(next);
    setError(null);
    setVisitProfile(null);
  }, []);

  const enqueueAlert = useCallback(
    (next: ScreenAlert) => {
      if (!alertRef.current) {
        showNext(next);
        playAlertSound();
        return;
      }
      queueRef.current.push(next);
      playAlertSound();
    },
    [playAlertSound, showNext],
  );

  const dismissAlert = useCallback(() => {
    const queued = queueRef.current.shift() ?? null;
    showNext(queued);
  }, [showNext]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 1);
      const { data } = await fetchReservations(since);
      if (cancelled) return;
      mapReservationsResponse(data).forEach((row) => seenIdsRef.current.add(row.id));
      readyRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const holdingMinutes = settings.reservationTableHoldingTime || 30;
    const run = () => {
      void markLateReservations(holdingMinutes);
    };
    run();
    const intervalId = window.setInterval(run, 60_000);
    return () => window.clearInterval(intervalId);
  }, [settings.reservationTableHoldingTime]);

  useEffect(() => {
    return subscribeToReservationChanges({
      onInsert: (reservation) => {
        if (seenIdsRef.current.has(reservation.id)) return;
        seenIdsRef.current.add(reservation.id);
        if (!readyRef.current) return;
        if (reservation.source !== "reservation" || reservation.status !== "pending") return;
        enqueueAlert({ kind: "new", reservation });
      },
    });
  }, [enqueueAlert]);

  useEffect(() => {
    return subscribeToGuestReservationAlerts((payload) => {
      const reservation = guestAlertToReservationRecord(payload);
      seenIdsRef.current.add(reservation.id);
      if (payload.kind === "cancelled") {
        enqueueAlert({ kind: "cancelled", reservation });
        return;
      }
      enqueueAlert({ kind: "updated", reservation, previous: payload.previous });
    });
  }, [enqueueAlert]);

  useEffect(() => {
    if (!alert || alert.kind === "cancelled") {
      setVisitProfile(null);
      return;
    }
    const incoming = alert.reservation;
    let cancelled = false;
    void fetchGuestVisitProfile({
      email: incoming.guestEmail,
      phone: incoming.guestPhone,
      excludeReservationId: incoming.id,
    }).then(({ data }) => {
      if (!cancelled) setVisitProfile(data.isReturning ? data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [alert]);

  const handleConfirm = async () => {
    if (!alert || (alert.kind !== "new" && alert.kind !== "updated")) return;
    if (alert.reservation.status !== "pending") {
      dismissAlert();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await confirmReservationWithEmail(alert.reservation.id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    dismissAlert();
  };

  const reservation = alert?.reservation ?? null;
  const eventLabel =
    reservation?.eventType &&
    pickEventTypeLabel(
      settings.reservationEventTypes.find((option) => option.id === reservation.eventType) ?? {
        id: reservation.eventType,
        labels: {
          en: reservation.eventType,
          cs: reservation.eventType,
          vi: reservation.eventType,
          de: reservation.eventType,
          ko: reservation.eventType,
        },
      },
      "en",
    );

  const title =
    alert?.kind === "cancelled"
      ? translate("resGuestCancelledTitle")
      : alert?.kind === "updated"
        ? translate("resGuestUpdatedTitle")
        : translate("resIncomingTitle");

  const hint =
    alert?.kind === "cancelled"
      ? translate("resGuestCancelledHint")
      : alert?.kind === "updated"
        ? translate("resGuestUpdatedHint")
        : translate("resIncomingHint");

  const previous = alert?.kind === "updated" ? alert.previous : undefined;
  const showPreviousTime =
    previous?.reservedAt &&
    reservation &&
    new Date(previous.reservedAt).getTime() !== reservation.reservedAt.getTime();
  const showPreviousParty =
    previous?.partySize != null && reservation && previous.partySize !== reservation.partySize;

  const canConfirm = Boolean(
    reservation && (alert?.kind === "new" || alert?.kind === "updated") && reservation.status === "pending",
  );

  return (
    <Modal
      open={alert != null}
      onClose={() => {
        if (!busy) dismissAlert();
      }}
      title={title}
    >
      {reservation ? (
        <div className="space-y-4">
          <p
            className={`text-sm ${
              alert?.kind === "cancelled"
                ? "font-medium text-red-700 dark:text-red-300"
                : "text-gray-600 dark:text-gray-300"
            }`}
          >
            {hint}
          </p>
          {visitProfile?.isReturning && alert?.kind !== "cancelled" ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/50">
              <GuestReturningBadge
                profile={visitProfile}
                email={reservation.guestEmail}
                phone={reservation.guestPhone}
                defaultOpen
              />
            </div>
          ) : null}
          <dl
            className={`space-y-2 rounded-xl px-4 py-3 text-sm ${
              alert?.kind === "cancelled"
                ? "bg-red-50 dark:bg-red-950/40"
                : "bg-zinc-100 dark:bg-zinc-800"
            }`}
          >
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">{translate("guestName")}</dt>
              <dd className="font-semibold text-gray-900 dark:text-gray-100">{reservation.guestName}</dd>
            </div>
            {reservation.bookingCode ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{translate("bookingCode")}</dt>
                <dd className="font-semibold text-gray-900 dark:text-gray-100">{reservation.bookingCode}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">{translate("partySize")}</dt>
              <dd className="font-semibold text-gray-900 dark:text-gray-100">
                {reservation.partySize}
                {showPreviousParty ? (
                  <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">
                    ({translate("resGuestPrevious")}: {previous?.partySize})
                  </span>
                ) : null}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">{translate("reservedAt")}</dt>
              <dd className="text-right font-semibold text-gray-900 dark:text-gray-100">
                {formatDateTime(reservation.reservedAt)}
                {showPreviousTime ? (
                  <span className="mt-0.5 block text-xs font-normal text-amber-700 dark:text-amber-300">
                    {translate("resGuestPrevious")}: {formatDateTime(previous!.reservedAt!)}
                  </span>
                ) : null}
              </dd>
            </div>
            {reservation.guestPhone ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{translate("guestPhone")}</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{reservation.guestPhone}</dd>
              </div>
            ) : null}
            {reservation.guestEmail ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{translate("guestEmail")}</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{reservation.guestEmail}</dd>
              </div>
            ) : null}
            {eventLabel ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{translate("resEventType")}</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{eventLabel}</dd>
              </div>
            ) : null}
            {reservation.notes ? (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">{translate("resNotes")}</dt>
                <dd className="mt-1 text-gray-800 dark:text-gray-200">{reservation.notes}</dd>
              </div>
            ) : null}
          </dl>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            {canConfirm ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirm()}
                className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? translate("confirming") : translate("resIncomingConfirm")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={dismissAlert}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold ${
                canConfirm
                  ? "border border-gray-200 text-gray-800 dark:border-gray-600 dark:text-gray-100"
                  : alert?.kind === "cancelled"
                    ? "bg-red-600 text-white"
                    : "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
              }`}
            >
              {canConfirm ? translate("resIncomingLater") : translate("resGuestAlertOk")}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
