"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ReservationReminderModal } from "@/components/reservation-reminder-modal";
import {
  loadDismissedReservationReminderIds,
  persistDismissedReservationReminderIds,
  pickNextReservationReminder,
} from "@/lib/reservation-reminder";
import type { ReservationRecord } from "@/lib/types";
import {
  fetchReservations,
  mapReservationRow,
  subscribeToReservationChanges,
} from "@/src/lib/reservation-actions";

const POLL_MS = 30_000;

export function ReservationReminderListener() {
  const [active, setActive] = useState<ReservationRecord | null>(null);
  const reservationsRef = useRef<ReservationRecord[]>([]);
  const dismissedRef = useRef<Set<string>>(loadDismissedReservationReminderIds());
  const activeIdRef = useRef<string | null>(null);

  const evaluate = useCallback(() => {
    if (activeIdRef.current) return;
    const next = pickNextReservationReminder(
      reservationsRef.current,
      dismissedRef.current,
    );
    if (!next) return;
    activeIdRef.current = next.id;
    setActive(next);
  }, []);

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
    const pollId = window.setInterval(() => void reload(), POLL_MS);
    const unsub = subscribeToReservationChanges(() => {
      void reload();
    });
    return () => {
      window.clearInterval(pollId);
      unsub();
    };
  }, [reload]);

  const handleAcknowledge = () => {
    const id = activeIdRef.current;
    if (id) {
      dismissedRef.current.add(id);
      persistDismissedReservationReminderIds(dismissedRef.current);
    }
    activeIdRef.current = null;
    setActive(null);
    // Show next due reminder if any (after dismiss).
    window.setTimeout(() => evaluate(), 0);
  };

  return (
    <ReservationReminderModal reservation={active} onAcknowledge={handleAcknowledge} />
  );
}
