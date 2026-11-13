"use client";

import { useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { ensurePushSubscription } from "@/lib/web-push-client";

/** A real push-service round trip scoped to the device pressing the button. */
export function PushNotificationCheck() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const check = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const status = await ensurePushSubscription();
      if (status !== "subscribed") {
        setMessage(status === "denied" ? "Allow notifications in this browser's site settings, then retry."
          : status === "unsupported" ? "Push is unavailable here. On iPhone, open POS from Add to Home Screen."
          : "Could not register this device. Check your connection and POS sign-in, then retry.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) { setMessage("No push subscription. Reload POS and retry."); return; }
      const response = await fetch("/api/push/test", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      setMessage(response.ok ? "Accepted by the push service. Check this device's notifications."
        : result.error || "Push test failed. Please retry.");
    } catch { setMessage("Push test could not finish. Check your connection and retry."); }
    finally { setBusy(false); }
  };
  return <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-700">
    <button type="button" disabled={busy} onClick={() => void check()} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-300">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
      {busy ? "Checking push…" : "Test phone push"}
    </button>
    {message && <p role="status" className="mt-2 text-xs text-gray-600 dark:text-gray-300">{message}</p>}
  </div>;
}
