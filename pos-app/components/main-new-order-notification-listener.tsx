"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { useSettings } from "@/contexts/settings-context";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";
import { playCustomAlertSound } from "@/lib/notification-sound";
import type { RestaurantTable } from "@/lib/types";

/** Collapse multi-line sent_to_kitchen logs from one Send into one alert. */
const TABLE_NOTIFY_DEBOUNCE_MS = 1200;

interface MainNewOrderNotificationListenerProps {
  tables: RestaurantTable[];
}

export function MainNewOrderNotificationListener({
  tables,
}: MainNewOrderNotificationListenerProps) {
  const { translate, notifyMainNewOrderEnabled, soundMainNewOrderEnabled } = useApp();
  const { settings } = useSettings();
  const { pushNotification } = useNotifications();
  const pendingByTableRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const tableLabelsRef = useRef(new Map<string, string>());

  tableLabelsRef.current = new Map(tables.map((table) => [table.id, table.label]));

  const notifyRef = useRef<(tableId: string, tableLabel?: string) => void>(() => {});
  notifyRef.current = (tableId: string, tableLabel?: string) => {
    if (!notifyMainNewOrderEnabled && !soundMainNewOrderEnabled) return;

    const label = tableLabel ?? tableLabelsRef.current.get(tableId) ?? "?";
    const message = translate("newOrderFromTable").replace("{table}", label);
    const notificationId = `main-new-table-${tableId}-${Date.now()}`;

    if (notifyMainNewOrderEnabled) {
      pushNotification({
        id: notificationId,
        message,
        playSound: soundMainNewOrderEnabled ? "mainNewOrder" : false,
      });
    } else if (soundMainNewOrderEnabled) {
      const soundUrl =
        settings.soundConfigs.mainNewOrder || settings.soundConfigs.newOrder;
      playCustomAlertSound(soundUrl, "newOrder");
    }
  };

  const scheduleNotify = (tableId: string | null | undefined, tableLabel?: string) => {
    if (!tableId) return;
    const existing = pendingByTableRef.current.get(tableId);
    if (existing) clearTimeout(existing);
    pendingByTableRef.current.set(
      tableId,
      setTimeout(() => {
        pendingByTableRef.current.delete(tableId);
        notifyRef.current(tableId, tableLabel);
      }, TABLE_NOTIFY_DEBOUNCE_MS),
    );
  };

  useEffect(() => {
    if (!notifyMainNewOrderEnabled && !soundMainNewOrderEnabled) return;

    // Only staff "Send to kitchen" logs — not checkout, not table sync noise.
    return subscribeToPostgresRowChanges(
      "main-new-order-activity",
      { event: "INSERT", schema: "public", table: "table_activity_logs" },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (row.action !== "sent_to_kitchen") return;
        const tableId = typeof row.table_id === "string" ? row.table_id : null;
        const label =
          typeof row.table_label === "string" && row.table_label.trim()
            ? row.table_label
            : tableId
              ? tableLabelsRef.current.get(tableId)
              : undefined;
        scheduleNotify(tableId, label);
      },
    );
  }, [notifyMainNewOrderEnabled, soundMainNewOrderEnabled]);

  useEffect(() => {
    const pending = pendingByTableRef.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  return null;
}
