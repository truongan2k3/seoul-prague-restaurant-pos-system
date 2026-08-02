import type { OrderLogEntry } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

export async function logOrderStatusChange(
  orderId: string,
  action: string,
  staffName: string,
) {
  return supabase.from("order_logs").insert({
    order_id: orderId,
    action,
    staff_name: staffName,
  });
}

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
