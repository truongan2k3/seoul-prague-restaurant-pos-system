"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ReservationReminderModal } from "@/components/reservation-reminder-modal";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { playCustomAlertSound } from "@/lib/notification-sound";
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
/** Safety net if realtime drops a row (rare). */
const SAFETY_REFETCH_MS = 5 * 60_000;

export function ReservationReminderListener() {
  const { soundMainEnabled } = useApp();
  const { settings } = useSettings();
  const [active, setActive] = useState<ReservationReminderHit | null>(null);
  const reservationsRef = useRef<ReservationRecord[]>([]);
  const dismissedRef = useRef<Set<string>>(loadDismissedReservationReminderIds());
  const activeKeyRef = useRef<string | null>(null);
  const reminderMode = settings.reservationReminderMode ?? "30";
  const reminderSound = settings.soundConfigs.reservationReminder;

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
    if (soundMainEnabled) {
      playCustomAlertSound(reminderSound, "newOrder");
    }
  }, [reminderMode, reminderSound, soundMainEnabled]);

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
    const safetyId = window.setInterval(() => void reload(), SAFETY_REFETCH_MS);
    const unsub = subscribeToReservationChanges(() => {
      void reload();
    });
    return () => {
      window.clearInterval(evaluateId);
      window.clearInterval(safetyId);
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
