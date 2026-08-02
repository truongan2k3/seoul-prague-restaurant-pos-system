"use client";

import { useEffect } from "react";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { orderItemDisplayName } from "@/lib/menu-display";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import type { MenuItem, RestaurantTable } from "@/lib/types";
import {
  fetchStaffNameForOrderAction,
  mapOrderItemRow,
  subscribeToOrderItemUpdates,
} from "@/src/lib/supabase-data";

interface ReadyNotificationListenerProps {
  tables: RestaurantTable[];
  menuItems: MenuItem[];
}

async function resolveStaffName(orderId: string): Promise<string> {
  let staffName = await fetchStaffNameForOrderAction(orderId, "ready");
  if (!staffName) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    staffName = await fetchStaffNameForOrderAction(orderId, "ready");
  }
  return staffName ?? "Staff";
}

export function ReadyNotificationListener({
  tables,
  menuItems,
}: ReadyNotificationListenerProps) {
  const { language, translate, soundMainEnabled } = useApp();
  const { pushNotification } = useNotifications();

  useEffect(() => {
    const tableLabels = new Map(tables.map((table) => [table.id, table.label]));

    return subscribeToOrderItemUpdates(({ new: row, old }) => {
      if (row.status !== "ready" && normalizeOrderItemStatus(row.status) !== "ready") return;
      if (old?.status === "ready" || normalizeOrderItemStatus(old?.status) === "ready") return;

      void (async () => {
        const item = mapOrderItemRow(row);
        const tableLabel = tableLabels.get(row.table_id) ?? "?";
        const itemName = orderItemDisplayName(item, menuItems, language);
        const staffName = await resolveStaffName(row.id);

        const message = `${translate("table")} ${tableLabel}: ${itemName} is ${translate("ready")} (by ${staffName})`;

        pushNotification({
          id: `ready-${row.id}-${row.updated_at}`,
          message,
          staffName,
          playSound: soundMainEnabled ? "ready" : false,
        });
      })();
    });
  }, [tables, menuItems, language, translate, pushNotification, soundMainEnabled]);

  return null;
}
