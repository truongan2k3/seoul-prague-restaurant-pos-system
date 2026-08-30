"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pathnameToPageTarget } from "@/lib/page-routes";
import { trackPagePresence } from "@/lib/pos-page-presence";

/** Sends periodic heartbeats so /status can show which pages are online. */
export function PagePresenceTracker() {
  const pathname = usePathname();
  const pageTarget = pathnameToPageTarget(pathname);

  useEffect(() => {
    if (!pageTarget) return;
    return trackPagePresence(pageTarget);
  }, [pageTarget]);

  return null;
}
