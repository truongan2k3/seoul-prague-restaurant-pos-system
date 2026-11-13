"use client";

import { useEffect, useState } from "react";

/** Refresh a visible guest form after capacity changes, without exposing booking
 * records through a public Realtime subscription. Pause during submission/holds. */
export function useReservationAvailabilityRefresh(enabled: boolean): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { if (!document.hidden) setRevision(value => value + 1); };
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [enabled]);
  return revision;
}
