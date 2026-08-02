"use client";

import { useEffect } from "react";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { orderItemDisplayName } from "@/lib/menu-display";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import type { MenuItem, RestaurantTable, Station } from "@/lib/types";
import {
  mapOrderItemRow,
  subscribeToOrderItemInserts,
} from "@/src/lib/supabase-data";

interface NewOrderNotificationListenerProps {
  station: Station;
  tables: RestaurantTable[];
  menuItems: MenuItem[];
}

export function NewOrderNotificationListener({
  station,
  tables,
  menuItems,
}: NewOrderNotificationListenerProps) {
  const { language, translate, soundKitchenEnabled } = useApp();
  const { pushNotification } = useNotifications();

  useEffect(() => {
    const tableLabels = new Map(tables.map((table) => [table.id, table.label]));

    return subscribeToOrderItemInserts((row) => {
      if (row.station !== station) return;
      const status = normalizeOrderItemStatus(row.status);
      if (status !== "preparing" && status !== "pending") return;

      const item = mapOrderItemRow(row);
      const tableLabel = tableLabels.get(row.table_id) ?? "?";
      const itemName = orderItemDisplayName(item, menuItems, language);
      const message = `${translate("table")} ${tableLabel}: ${translate("newOrder")} — ${itemName}`;

      pushNotification({
        id: `new-${row.id}-${row.created_at}`,
        message,
        playSound: soundKitchenEnabled ? "newOrder" : false,
      });
    });
  }, [station, tables, menuItems, language, translate, pushNotification, soundKitchenEnabled]);

  return null;
}
