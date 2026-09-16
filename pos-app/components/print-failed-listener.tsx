"use client";

import { useEffect } from "react";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { subscribeToPrintFailed } from "@/lib/pos-notifications";

/** Main POS: notify when Print Station fails (bridge off / printer error). */
export function PrintFailedListener() {
  const { translate } = useApp();
  const { pushToast } = useNotifications();

  useEffect(() => {
    return subscribeToPrintFailed((payload) => {
      const tablePart = payload.tableLabel
        ? ` · ${translate("table")} ${payload.tableLabel}`
        : "";
      pushToast({
        id: `print-failed-${payload.pendingId}`,
        message: `🖨️ ${translate("printFailedToast")}${tablePart} — ${translate("printFailedToastHint")}`,
      });
    });
  }, [pushToast, translate]);

  return null;
}
