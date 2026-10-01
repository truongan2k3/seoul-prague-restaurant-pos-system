"use client";

import { useEffect, useRef } from "react";

/**
 * Keep the display awake while this screen is visible (KDS / Bar tablets).
 * Uses the Screen Wake Lock API; no-ops when unsupported. Re-acquires after
 * the tab becomes visible again (browsers release the lock when hidden).
 */
export function useScreenWakeLock(enabled = true) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    let cancelled = false;

    const clearRef = () => {
      wakeLockRef.current = null;
    };

    const release = async () => {
      const current = wakeLockRef.current;
      clearRef();
      if (!current) return;
      try {
        await current.release();
      } catch {
        // Already released by the browser.
      }
    };

    const request = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        await release();
        if (cancelled || document.visibilityState !== "visible") return;
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          try {
            await sentinel.release();
          } catch {
            // ignore
          }
          return;
        }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) clearRef();
        });
      } catch {
        // Permission / policy / unsupported — leave screen behavior to OS.
      }
    };

    void request();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void request();
      else void release();
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void release();
    };
  }, [enabled]);
}
