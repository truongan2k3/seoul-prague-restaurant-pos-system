"use server";

import { resolveStaffActor } from "@/src/lib/staff-actor";
import { supabase } from "@/src/lib/supabase";

export async function logOrderStatusChange(
  orderId: string,
  action: string,
  staffHint?: string,
) {
  const actor = await resolveStaffActor(
    staffHint ? { staffName: staffHint } : undefined,
  );

  return supabase.from("order_logs").insert({
    order_id: orderId,
    action,
    staff_name: actor.staffName,
  });
}

export async function logTableActivity(input: {
  tableId: string;
  tableLabel?: string;
  orderItemId?: string;
  itemName?: string;
  action: string;
  staffId?: string;
  staffName?: string;
  meta?: Record<string, unknown>;
}) {
  const actor = await resolveStaffActor({
    staffId: input.staffId,
    staffName: input.staffName,
  });

  return supabase.from("table_activity_logs").insert({
    table_id: input.tableId,
    table_label: input.tableLabel ?? null,
    order_item_id: input.orderItemId ?? null,
    item_name: input.itemName ?? null,
    action: input.action,
    staff_id: actor.staffId ?? null,
    staff_name: actor.staffName,
    meta: input.meta ?? {},
  });
}
