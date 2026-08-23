import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { OrderItem, RestaurantTable, Station } from "@/lib/types";
import {
  mapOrderItemRow,
  mapTableRow,
  type SupabaseOrderItemRow,
  type SupabaseTableRow,
} from "@/src/lib/supabase-data";

export type StationOrderItem = OrderItem & {
  tableId: string;
  createdAt?: string;
};

function toStationItem(row: SupabaseOrderItemRow): StationOrderItem {
  return {
    ...mapOrderItemRow(row),
    tableId: row.table_id,
    createdAt: row.created_at,
  };
}

function isActiveFloorItem(item: OrderItem): boolean {
  return item.kitchenStatus !== "archived";
}

function isStationBoardItem(row: SupabaseOrderItemRow, station: Station): boolean {
  if (row.station !== station) return false;
  if (row.kitchen_status === "archived") return false;
  const status = row.kitchen_status ?? row.status;
  return (
    status === "pending" ||
    status === "preparing" ||
    status === "ready" ||
    status === "served" ||
    status === "cancelled"
  );
}

export function applyOrderItemRealtimeEvent(
  items: OrderItem[],
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): OrderItem[] {
  const eventType = payload.eventType;

  if (eventType === "DELETE") {
    const id = (payload.old as unknown as SupabaseOrderItemRow | undefined)?.id;
    return id ? items.filter((item) => item.id !== id) : items;
  }

  const newRow = payload.new as unknown as SupabaseOrderItemRow | undefined;
  if (!newRow?.id) return items;

  const mapped = mapOrderItemRow(newRow);
  if (!isActiveFloorItem(mapped)) {
    return items.filter((item) => item.id !== mapped.id);
  }

  const index = items.findIndex((item) => item.id === mapped.id);
  if (index >= 0) {
    const next = items.slice();
    next[index] = mapped;
    return next;
  }

  return [...items, mapped];
}

export function applyStationOrderItemRealtimeEvent(
  items: StationOrderItem[],
  station: Station,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): StationOrderItem[] {
  const eventType = payload.eventType;

  if (eventType === "DELETE") {
    const id = (payload.old as unknown as SupabaseOrderItemRow | undefined)?.id;
    return id ? items.filter((item) => item.id !== id) : items;
  }

  const newRow = payload.new as unknown as SupabaseOrderItemRow | undefined;
  if (!newRow?.id) return items;

  if (!isStationBoardItem(newRow, station)) {
    return items.filter((item) => item.id !== newRow.id);
  }

  const mapped = toStationItem(newRow);
  const index = items.findIndex((item) => item.id === mapped.id);
  if (index >= 0) {
    const next = items.slice();
    next[index] = mapped;
    return next;
  }

  return [...items, mapped];
}

export function applyTableRealtimeEvent(
  tables: RestaurantTable[],
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): RestaurantTable[] {
  const eventType = payload.eventType;

  if (eventType === "DELETE") {
    const id = (payload.old as unknown as SupabaseTableRow | undefined)?.id;
    return id ? tables.filter((table) => table.id !== id) : tables;
  }

  const newRow = payload.new as unknown as SupabaseTableRow | undefined;
  if (!newRow?.id) return tables;

  const mapped = mapTableRow(newRow);
  const index = tables.findIndex((table) => table.id === mapped.id);
  if (index >= 0) {
    const next = tables.slice();
    next[index] = { ...next[index], ...mapped, orders: mapped.orders ?? next[index].orders };
    return next;
  }

  return [...tables, mapped];
}
