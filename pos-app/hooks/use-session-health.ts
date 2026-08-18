"use client";

import { useEffect, useRef } from "react";
import { notifyPosDataSynced } from "@/lib/pos-refresh";

/** Screen off / background — sync when user returns after this long. */
export const HIDDEN_REFRESH_MS = 5 * 60 * 1000;
/** Tab open but no taps/keys — sync again after this long. */
export const IDLE_REFRESH_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export interface SessionHealthOptions {
  /** Reload POS/KDS data — not a full page navigation. */
  onRefresh: () => void;
  /** Skip refresh while staff is mid-order / checkout. */
  isBusy?: () => boolean;
  enabled?: boolean;
}

/**
 * Keeps long-running POS tabs fresh: reload after tab was hidden, and after ~1h idle.
 */
export function useSessionHealth({
  onRefresh,
  isBusy,
  enabled = true,
}: SessionHealthOptions): void {
  const onRefreshRef = useRef(onRefresh);
  const isBusyRef = useRef(isBusy);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    isBusyRef.current = isBusy;
  }, [isBusy]);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    let hiddenAt: number | null = null;
    let lastInteraction = Date.now();

    const markInteraction = () => {
      lastInteraction = Date.now();
    };

    const tryRefresh = () => {
      if (document.hidden) return;
      if (isBusyRef.current?.()) return;
      onRefreshRef.current();
      notifyPosDataSynced();
      lastInteraction = Date.now();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= HIDDEN_REFRESH_MS) {
        tryRefresh();
      }
      hiddenAt = null;
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pointerdown", markInteraction, { passive: true });
    window.addEventListener("keydown", markInteraction);

    const interval = window.setInterval(() => {
      if (document.hidden) return;
      if (isBusyRef.current?.()) return;
      if (Date.now() - lastInteraction < IDLE_REFRESH_MS) return;
      tryRefresh();
    }, CHECK_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pointerdown", markInteraction);
      window.removeEventListener("keydown", markInteraction);
      window.clearInterval(interval);
    };
  }, [enabled]);
}
