"use client";

import { useEffect } from "react";
import { ensurePushSubscription } from "@/lib/web-push-client";

/**
 * Registers the service worker and Web Push subscription on the main POS
 * so phones can receive reservation alerts when the tab is closed.
 */
export function PushSubscriptionBootstrap() {
  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      clearTimeout(retry);
      const status = await ensurePushSubscription({ requestPermission: false });
      if (!disposed && status === "error") retry = setTimeout(() => void run(), 30000);
    };
    const onGesture = () => { void ensurePushSubscription(); };
    const onVisible = () => { if (document.visibilityState === "visible") void run(); };
    void run();
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      clearTimeout(retry);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
