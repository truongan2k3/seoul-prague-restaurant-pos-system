"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ReservationReminderModal } from "@/components/reservation-reminder-modal";
import { useSettings } from "@/contexts/settings-context";
import {
  loadDismissedReservationReminderIds,
  persistDismissedReservationReminderIds,
  pickNextReservationReminder,
  type ReservationReminderHit,
} from "@/lib/reservation-reminder";
import type { ReservationRecord } from "@/lib/types";
import {
  fetchReservations,
  mapReservationRow,
  subscribeToReservationChanges,
} from "@/src/lib/reservation-actions";

/** Local-only check — no network. */
const EVALUATE_MS = 30_000;

export function ReservationReminderListener() {
  const { settings } = useSettings();
  const [active, setActive] = useState<ReservationReminderHit | null>(null);
  const reservationsRef = useRef<ReservationRecord[]>([]);
  const dismissedRef = useRef<Set<string>>(loadDismissedReservationReminderIds());
  const activeKeyRef = useRef<string | null>(null);
  const reminderMode = settings.reservationReminderMode ?? "30";

  const evaluate = useCallback(() => {
    if (activeKeyRef.current) return;
    const next = pickNextReservationReminder(
      reservationsRef.current,
      dismissedRef.current,
      reminderMode,
    );
    if (!next) return;
    activeKeyRef.current = next.dismissKey;
    setActive(next);
  }, [reminderMode]);

  const reload = useCallback(async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const { data, error } = await fetchReservations(since);
    if (error || !data) return;
    reservationsRef.current = (data as Parameters<typeof mapReservationRow>[0][]).map(
      mapReservationRow,
    );
    evaluate();
  }, [evaluate]);

  useEffect(() => {
    void reload();
    const evaluateId = window.setInterval(() => evaluate(), EVALUATE_MS);
    const unsub = subscribeToReservationChanges(() => {
      void reload();
    });
    return () => {
      window.clearInterval(evaluateId);
      unsub();
    };
  }, [reload, evaluate]);

  const handleAcknowledge = () => {
    const key = activeKeyRef.current;
    if (key) {
      dismissedRef.current.add(key);
      persistDismissedReservationReminderIds(dismissedRef.current);
    }
    activeKeyRef.current = null;
    setActive(null);
    window.setTimeout(() => evaluate(), 0);
  };

  return (
    <ReservationReminderModal
      reservation={active?.reservation ?? null}
      leadMinutes={active?.leadMinutes}
      onAcknowledge={handleAcknowledge}
    />
  );
}
