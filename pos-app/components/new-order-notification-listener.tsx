"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { useDeviceNotificationSound } from "@/hooks/use-device-notification-sound";
import { claimNotificationEvent } from "@/lib/notification-preferences";
import { playNotificationCategory } from "@/lib/notification-sound";
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
  const { language, translate } = useApp();
  const { pushNotification } = useNotifications();
  const { settings } = useSettings();
  const [enabled] = useDeviceNotificationSound(station);
  const playback = useRef(() => {});
  playback.current = () => playNotificationCategory(station, settings.soundConfigs.notifications, enabled);


  useEffect(() => {
    const tableLabels = new Map(tables.map((table) => [table.id, table.label]));

    return subscribeToOrderItemInserts((row) => {
      if (row.station !== station) return;
      if (row.hide_on_kds) return;
      const status = normalizeOrderItemStatus(row.status);
      if (status !== "preparing" && status !== "pending") return;

      if (claimNotificationEvent(`station:${station}`, `${row.table_id}:${row.created_at}`, row.created_at)) playback.current();
      const item = mapOrderItemRow(row);
      const tableLabel = tableLabels.get(row.table_id) ?? "?";
      const itemName = orderItemDisplayName(item, menuItems, language);
      const message = `${translate("table")} ${tableLabel}: ${translate("newOrder")} — ${itemName}`;

      pushNotification({
        id: `new-${row.id}-${row.created_at}`,
        message,
        playSound: false,
      });
    });
  }, [station, tables, menuItems, language, translate, pushNotification]);

  return null;
}
