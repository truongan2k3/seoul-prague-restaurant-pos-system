import type { TableActivityLogEntry } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

export { logTableActivity } from "@/src/lib/activity-log-server";

type TableActivityLogRow = {
  id: string;
  table_id: string | null;
  table_label: string | null;
  order_item_id: string | null;
  item_name: string | null;
  action: string;
  staff_id: string | null;
  staff_name: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};

function mapRow(row: TableActivityLogRow): TableActivityLogEntry {
  return {
    id: row.id,
    tableId: row.table_id ?? undefined,
    tableLabel: row.table_label ?? undefined,
    orderItemId: row.order_item_id ?? undefined,
    itemName: row.item_name ?? undefined,
    action: row.action,
    staffName: row.staff_name,
    meta: row.meta ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

export async function fetchTableActivityLogs(tableId: string, since?: Date) {
  let query = supabase
    .from("table_activity_logs")
    .select("*")
    .eq("table_id", tableId)
    .order("created_at", { ascending: true });

  if (since) {
    query = query.gte("created_at", since.toISOString());
  }

  const { data, error } = await query;
  if (error) return { data: [] as TableActivityLogEntry[], error };

  return {
    data: (data as TableActivityLogRow[]).map(mapRow),
    error: null,
  };
}

export function tableActivityLogsToSnapshot(entries: TableActivityLogEntry[]) {
  return entries.map((entry) => ({
    id: entry.id,
    orderId: entry.orderItemId,
    itemName: entry.itemName,
    action: entry.action,
    staffName: entry.staffName,
    meta: entry.meta,
    createdAt: entry.createdAt.toISOString(),
  }));
}
