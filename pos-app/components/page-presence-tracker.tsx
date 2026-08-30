"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pathnameToPageTarget } from "@/lib/page-routes";
import { trackPagePresence } from "@/lib/pos-page-presence";
import { useConnectionStatus } from "@/contexts/connection-status-context";

/** Sends periodic heartbeats so /status can show which pages are online. */
export function PagePresenceTracker() {
  const pathname = usePathname();
  const pageTarget = pathnameToPageTarget(pathname);
  const { setStatus } = useConnectionStatus();

  useEffect(() => {
    if (!pageTarget) {
      setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "no-network" : "offline");
      return;
    }
    return trackPagePresence(pageTarget, setStatus);
  }, [pageTarget, setStatus]);

  return null;
}
