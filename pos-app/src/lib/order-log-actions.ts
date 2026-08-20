import type { OrderLogEntry } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

export { logOrderStatusChange } from "@/src/lib/activity-log-server";

export async function fetchOrderLogsForItems(orderItemIds: string[]) {
  if (orderItemIds.length === 0) {
    return { data: [] as OrderLogEntry[], error: null };
  }

  const { data, error } = await supabase
    .from("order_logs")
    .select("id, order_id, action, staff_name, created_at")
    .in("order_id", orderItemIds)
    .order("created_at", { ascending: true });

  if (error) return { data: [] as OrderLogEntry[], error };

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      orderId: row.order_id,
      action: row.action,
      staffName: row.staff_name,
      createdAt: new Date(row.created_at),
    })),
    error: null,
  };
}

/** All order_logs for every line on this table (including cancelled rows). */
export async function fetchOrderLogsForTable(tableId: string, since?: Date) {
  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("id, name, created_at")
    .eq("table_id", tableId)
    .order("created_at", { ascending: true });

  if (itemsError) return { data: [] as OrderLogEntry[], error: itemsError, itemNames: new Map<string, string>() };

  const itemNames = new Map<string, string>(
    (items ?? []).map((row) => [row.id, String(row.name)]),
  );
  const ids = [...itemNames.keys()];
  const logsRes = await fetchOrderLogsForItems(ids);
  const data =
    since != null
      ? logsRes.data.filter((entry) => entry.createdAt.getTime() >= since.getTime())
      : logsRes.data;
  return { ...logsRes, data, itemNames };
}
