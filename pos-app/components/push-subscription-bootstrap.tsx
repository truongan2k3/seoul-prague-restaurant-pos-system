"use client";

import { useEffect, useRef } from "react";
import { ensurePushSubscription } from "@/lib/web-push-client";

/**
 * Registers the service worker and Web Push subscription on the main POS
 * so phones can receive reservation alerts when the tab is closed.
 */
export function PushSubscriptionBootstrap() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = () => {
      void ensurePushSubscription();
    };

    run();
    window.addEventListener("pointerdown", run, { once: true });
    return () => window.removeEventListener("pointerdown", run);
  }, []);

  return null;
}
