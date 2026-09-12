"use client";

import { useEffect } from "react";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { useSettings } from "@/contexts/settings-context";
import { playCallWaiterSound } from "@/lib/notification-sound";
import { requestKindLabel } from "@/lib/table-guest";
import { subscribeToTableGuestRequests } from "@/lib/table-guest-alert";

/** Main POS: toast when a guest sends a request from table QR. */
export function TableGuestRequestListener() {
  const { soundMainEnabled, translate } = useApp();
  const { settings } = useSettings();
  const { pushToast } = useNotifications();

  useEffect(() => {
    return subscribeToTableGuestRequests((payload) => {
      pushToast({
        id: `table-guest-${payload.requestId}`,
        message: `🛎️ ${translate("table")} ${payload.tableLabel} · ${requestKindLabel(payload.kind)} — ${payload.summary}`,
      });
      if (soundMainEnabled) {
        playCallWaiterSound(settings.soundConfigs.callWaiter);
      }
    });
  }, [pushToast, soundMainEnabled, settings.soundConfigs.callWaiter, translate]);

  return null;
}
