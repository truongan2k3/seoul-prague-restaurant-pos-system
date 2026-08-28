"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/app-context";
import {
  isReservationUndoActive,
  reservationUndoRemainingMs,
  type ReservationUndoAction,
  type ReservationUndoEntry,
} from "@/lib/reservation-undo";

const UNDO_LABEL_KEYS: Record<ReservationUndoAction, "resUndoAssign" | "resUndoCheckIn" | "resUndoCancel"> = {
  assign: "resUndoAssign",
  check_in: "resUndoCheckIn",
  cancel: "resUndoCancel",
};

interface ReservationUndoBarProps {
  entry: ReservationUndoEntry | null;
  busy?: boolean;
  onUndo: (entry: ReservationUndoEntry) => void;
  onExpire: () => void;
}

export function ReservationUndoBar({ entry, busy = false, onUndo, onExpire }: ReservationUndoBarProps) {
  const { translate } = useApp();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isReservationUndoActive(entry, now)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [entry, now]);

  useEffect(() => {
    if (!entry) return;
    const remaining = reservationUndoRemainingMs(entry, now);
    if (remaining > 0) return;
    onExpire();
  }, [entry, now, onExpire]);

  if (!isReservationUndoActive(entry, now)) return null;

  const seconds = Math.ceil(reservationUndoRemainingMs(entry, now) / 1000);

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[90] w-[min(100%-2rem,28rem)] -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-lg dark:border-amber-800 dark:bg-gray-900">
        <p className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
          {translate(UNDO_LABEL_KEYS[entry.action])}
        </p>
        <span className="shrink-0 font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {translate("resUndoSeconds").replace("{s}", String(seconds))}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => onUndo(entry)}
          className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-950 disabled:opacity-50"
        >
          {translate("resUndoButton")}
        </button>
      </div>
    </div>
  );
}
