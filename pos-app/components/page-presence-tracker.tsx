"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pathnameToPageTarget } from "@/lib/page-routes";
import { trackConnectionHealth } from "@/lib/connection-health";
import { useConnectionStatus } from "@/contexts/connection-status-context";

/** Tracks network/realtime health without page-presence heartbeats. */
export function PagePresenceTracker() {
  const pathname = usePathname();
  const pageTarget = pathnameToPageTarget(pathname);
  const { setStatus } = useConnectionStatus();

  useEffect(() => {
    if (!pageTarget) {
      setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "no-network" : "offline");
      return;
    }
    return trackConnectionHealth(setStatus);
  }, [pageTarget, setStatus]);

  return null;
}
