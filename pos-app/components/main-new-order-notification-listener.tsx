"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { useSettings } from "@/contexts/settings-context";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import { playCustomAlertSound } from "@/lib/notification-sound";
import type { RestaurantTable } from "@/lib/types";
import { subscribeToOrderItemInserts } from "@/src/lib/supabase-data";

const TABLE_NOTIFY_DEBOUNCE_MS = 500;

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

  useEffect(() => {
    if (!notifyMainNewOrderEnabled && !soundMainNewOrderEnabled) return;

    const tableLabels = new Map(tables.map((table) => [table.id, table.label]));

    const notifyTable = (tableId: string) => {
      const tableLabel = tableLabels.get(tableId) ?? "?";
      const message = translate("newOrderFromTable").replace("{table}", tableLabel);
      const notificationId = `main-new-table-${tableId}`;

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

    return subscribeToOrderItemInserts((row) => {
      if (row.hide_on_kds) return;
      const status = normalizeOrderItemStatus(row.status);
      if (status !== "preparing" && status !== "pending") return;

      const tableId = row.table_id;
      const existing = pendingByTableRef.current.get(tableId);
      if (existing) clearTimeout(existing);

      pendingByTableRef.current.set(
        tableId,
        setTimeout(() => {
          pendingByTableRef.current.delete(tableId);
          notifyTable(tableId);
        }, TABLE_NOTIFY_DEBOUNCE_MS),
      );
    }, "order-items-main-new-order");
  }, [
    tables,
    translate,
    pushNotification,
    notifyMainNewOrderEnabled,
    soundMainNewOrderEnabled,
    settings.soundConfigs.mainNewOrder,
    settings.soundConfigs.newOrder,
  ]);

  useEffect(() => {
    const pending = pendingByTableRef.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  return null;
}
