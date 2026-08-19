"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { useSettings } from "@/contexts/settings-context";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";
import { playCustomAlertSound } from "@/lib/notification-sound";
import type { OrderItem, RestaurantTable } from "@/lib/types";
import { subscribeToOrderItemInserts } from "@/src/lib/supabase-data";

const TABLE_NOTIFY_DEBOUNCE_MS = 500;

interface MainNewOrderNotificationListenerProps {
  tables: RestaurantTable[];
}

function countBillableLines(orders: unknown): number {
  if (!Array.isArray(orders)) return 0;
  return orders.reduce((sum, entry) => {
    const item = entry as Partial<OrderItem>;
    const qty = typeof item.quantity === "number" ? item.quantity : 1;
    return sum + Math.max(0, qty);
  }, 0);
}

export function MainNewOrderNotificationListener({
  tables,
}: MainNewOrderNotificationListenerProps) {
  const { translate, notifyMainNewOrderEnabled, soundMainNewOrderEnabled } = useApp();
  const { settings } = useSettings();
  const { pushNotification } = useNotifications();
  const pendingByTableRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const notifiedAtRef = useRef(new Map<string, number>());

  const notifyRef = useRef<(tableId: string, tableLabel?: string) => void>(() => {});
  notifyRef.current = (tableId: string, tableLabel?: string) => {
    if (!notifyMainNewOrderEnabled && !soundMainNewOrderEnabled) return;

    const now = Date.now();
    const lastAt = notifiedAtRef.current.get(tableId) ?? 0;
    if (now - lastAt < TABLE_NOTIFY_DEBOUNCE_MS) return;

    const label =
      tableLabel ??
      tables.find((table) => table.id === tableId)?.label ??
      "?";
    const message = translate("newOrderFromTable").replace("{table}", label);
    const notificationId = `main-new-table-${tableId}-${now}`;

    notifiedAtRef.current.set(tableId, now);

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

    const tableLabels = new Map(tables.map((table) => [table.id, table.label]));

    const unsubItems = subscribeToOrderItemInserts((row) => {
      if (row.is_cancelled) return;
      scheduleNotify(row.table_id, tableLabels.get(row.table_id));
    }, "order-items-main-new-order");

    const unsubTables = subscribeToPostgresRowChanges(
      "main-new-order-tables",
      { event: "UPDATE", schema: "public", table: "tables" },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        const old = (payload.old as Record<string, unknown> | null) ?? null;
        const tableId = typeof row.id === "string" ? row.id : null;
        if (!tableId) return;

        const newCount = countBillableLines(row.orders);
        const oldCount = countBillableLines(old?.orders);
        const becameOccupied =
          old?.status === "empty" && row.status !== "empty" && newCount > 0;

        if (newCount > oldCount || becameOccupied) {
          const label =
            typeof row.label === "string"
              ? row.label
              : tableLabels.get(tableId);
          scheduleNotify(tableId, label);
        }
      },
    );

    const unsubActivity = subscribeToPostgresRowChanges(
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
              ? tableLabels.get(tableId)
              : undefined;
        scheduleNotify(tableId, label);
      },
    );

    return () => {
      unsubItems();
      unsubTables();
      unsubActivity();
    };
  }, [tables, notifyMainNewOrderEnabled, soundMainNewOrderEnabled]);

  useEffect(() => {
    const pending = pendingByTableRef.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  return null;
}
