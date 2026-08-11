"use client";

import { useEffect } from "react";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { useSettings } from "@/contexts/settings-context";
import { playCallWaiterSound } from "@/lib/notification-sound";
import { subscribeToCallWaiter } from "@/lib/pos-notifications";

/** Main POS: listen for KDS/Bar "Call Waiter" realtime broadcasts. */
export function CallWaiterListener() {
  const { soundMainEnabled, translate } = useApp();
  const { settings } = useSettings();
  const { pushToast } = useNotifications();

  useEffect(() => {
    return subscribeToCallWaiter((payload) => {
      const tablePart = payload.tableLabel
        ? ` · ${translate("table")} ${payload.tableLabel}`
        : "";
      pushToast({
        id: `call-waiter-${payload.at}`,
        message: `🔔 ${translate("callWaiterToast")}${tablePart}`,
      });

      if (soundMainEnabled) {
        playCallWaiterSound(settings.soundConfigs.callWaiter);
      }
    });
  }, [
    pushToast,
    soundMainEnabled,
    settings.soundConfigs.callWaiter,
    translate,
  ]);

  return null;
}
