"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { playCustomAlertSound } from "@/lib/notification-sound";
import { pickEventTypeLabel } from "@/lib/reservation-guest-form";
import type { ReservationRecord } from "@/lib/types";
import {
  fetchReservations,
  mapReservationsResponse,
  markLateReservations,
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
    return { error: payload.error || "Failed to confirm reservation" };
  }
  return { error: null };
}

/** Popup on main POS when a guest submits an online reservation. */
export function ReservationIncomingListener() {
  const { translate, language, soundMainEnabled } = useApp();
  const { settings } = useSettings();
  const [incoming, setIncoming] = useState<ReservationRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const readyRef = useRef(false);

  const formatDateTime = useCallback(
    (date: Date) =>
      date.toLocaleString(
        language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB",
        { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
      ),
    [language],
  );

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
    return subscribeToReservationChanges({
      onInsert: (reservation) => {
        if (seenIdsRef.current.has(reservation.id)) return;
        seenIdsRef.current.add(reservation.id);
        if (!readyRef.current) return;
        if (reservation.source !== "reservation" || reservation.status !== "pending") return;

        setError(null);
        setIncoming(reservation);
        if (soundMainEnabled) {
          const soundUrl =
            settings.soundConfigs.newOrder || settings.soundConfigs.mainNewOrder;
          playCustomAlertSound(soundUrl, "newOrder");
        }
      },
    });
  }, [settings.soundConfigs.mainNewOrder, settings.soundConfigs.newOrder, soundMainEnabled]);

  const handleConfirm = async () => {
    if (!incoming) return;
    setBusy(true);
    setError(null);
    const result = await confirmReservationWithEmail(incoming.id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setIncoming(null);
  };

  const eventLabel =
    incoming?.eventType &&
    pickEventTypeLabel(
      settings.reservationEventTypes.find((option) => option.id === incoming.eventType) ?? {
        id: incoming.eventType,
        labels: {
          en: incoming.eventType,
          cs: incoming.eventType,
          vi: incoming.eventType,
          de: incoming.eventType,
          ko: incoming.eventType,
        },
      },
      "en",
    );

  return (
    <Modal
      open={incoming != null}
      onClose={() => {
        if (!busy) setIncoming(null);
      }}
      title={translate("resIncomingTitle")}
    >
      {incoming ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">{translate("resIncomingHint")}</p>
          <dl className="space-y-2 rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-800">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">{translate("guestName")}</dt>
              <dd className="font-semibold text-gray-900 dark:text-gray-100">{incoming.guestName}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">{translate("partySize")}</dt>
              <dd className="font-semibold text-gray-900 dark:text-gray-100">{incoming.partySize}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">{translate("reservedAt")}</dt>
              <dd className="font-semibold text-gray-900 dark:text-gray-100">
                {formatDateTime(incoming.reservedAt)}
              </dd>
            </div>
            {incoming.guestPhone ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{translate("guestPhone")}</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{incoming.guestPhone}</dd>
              </div>
            ) : null}
            {incoming.guestEmail ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{translate("guestEmail")}</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{incoming.guestEmail}</dd>
              </div>
            ) : null}
            {eventLabel ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{translate("resEventType")}</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{eventLabel}</dd>
              </div>
            ) : null}
            {incoming.notes ? (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">{translate("resNotes")}</dt>
                <dd className="mt-1 text-gray-800 dark:text-gray-200">{incoming.notes}</dd>
              </div>
            ) : null}
          </dl>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleConfirm()}
              className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? translate("confirming") : translate("resIncomingConfirm")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setIncoming(null)}
              className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-800 dark:border-gray-600 dark:text-gray-100"
            >
              {translate("resIncomingLater")}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
