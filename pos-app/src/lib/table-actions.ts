import type { CheckoutPaymentRecord } from "@/lib/checkout-calculations";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import type { OrderItem } from "@/lib/types";
import { logOrderStatusChange, fetchOrderLogsForItems } from "@/src/lib/order-log-actions";
import { completeReservationForTable, findActiveReservationForTable, mapReservationRow } from "@/src/lib/reservation-actions";
import { mapOrderItemRow, type SupabaseOrderItemRow } from "@/src/lib/supabase-data";
import { supabase } from "@/src/lib/supabase";

function aggregateOrderItems(items: OrderItem[]): OrderItem[] {
  const merged: OrderItem[] = [];

  for (const item of items) {
    const match = merged.find(
      (entry) =>
        entry.name === item.name &&
        entry.notes === item.notes &&
        entry.notesTranslated === item.notesTranslated &&
        entry.isPrintedNote === item.isPrintedNote &&
        normalizeOrderItemStatus(entry.status) === normalizeOrderItemStatus(item.status) &&
        entry.price === item.price &&
        entry.station === item.station,
    );

    if (match) {
      match.quantity += item.quantity;
    } else {
      merged.push({ ...item });
    }
  }

  return merged;
}

async function syncTableOrdersFromDb(tableId: string) {
  const { data: rows } = await supabase
    .from("order_items")
    .select("*")
    .eq("table_id", tableId);

  if (!rows?.length) {
    const { data: table } = await supabase.from("tables").select("status").eq("id", tableId).single();
    if (table?.status === "empty") return;
    await clearTable(tableId);
    return;
  }

  const orders = aggregateOrderItems(
    (rows as SupabaseOrderItemRow[]).map(mapOrderItemRow),
  );

  const hasPreparing = orders.some(
    (item) => normalizeOrderItemStatus(item.status) === "preparing",
  );
  const allReadyOrServed = orders.every((item) => {
    const status = normalizeOrderItemStatus(item.status);
    return status === "ready" || status === "served";
  });

  await supabase
    .from("tables")
    .update({
      orders,
      status: allReadyOrServed && !hasPreparing ? "ready" : "waiting",
    })
    .eq("id", tableId);
}

async function insertOrderRowsWithLogs(
  tableId: string,
  orders: OrderItem[],
  staffId?: string,
  staffName?: string,
) {
  const orderRows = buildOrderRows(tableId, orders, staffId);
  if (orderRows.length === 0) return { error: null as Error | null };

  const { data, error } = await supabase.from("order_items").insert(orderRows).select("id");
  if (error) return { error };

  const actor = staffName ?? "Staff";
  for (const row of data ?? []) {
    await logOrderStatusChange(row.id, "preparing", actor);
  }

  return { error: null as Error | null };
}

function mergeOrderItems(existing: OrderItem[], incoming: OrderItem[]): OrderItem[] {
  const merged = existing.map((item) => ({ ...item }));

  for (const item of incoming) {
    const match = merged.find(
      (entry) =>
        entry.name === item.name &&
        entry.notes === item.notes &&
        entry.notesTranslated === item.notesTranslated &&
        entry.isPrintedNote === item.isPrintedNote &&
        entry.status === item.status &&
        entry.price === item.price &&
        entry.station === item.station,
    );

    if (match) {
      match.quantity += item.quantity;
    } else {
      merged.push({ ...item });
    }
  }

  return merged;
}

function buildOrderRows(tableId: string, orders: OrderItem[], staffId?: string) {
  return orders.flatMap((item) =>
    Array.from({ length: item.quantity }, () => ({
      table_id: tableId,
      menu_item_id: item.menuItemId ?? null,
      staff_id: staffId ?? null,
      name: item.name,
      price: item.price,
      quantity: 1,
      notes: item.notes ?? null,
      notes_translated: item.notesTranslated ?? null,
      is_printed_note: item.isPrintedNote ?? false,
      station: item.station ?? "kitchen",
      status: item.status ?? "preparing",
    })),
  );
}

export async function occupyTable(
  tableId: string,
  orders: OrderItem[],
  staffId?: string,
  staffName?: string,
) {
  const occupiedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("tables")
    .update({
      status: "waiting",
      occupied_at: occupiedAt,
      orders,
    })
    .eq("id", tableId)
    .select("*")
    .single();

  if (error) return { data, error };

  const { error: itemsError } = await insertOrderRowsWithLogs(tableId, orders, staffId, staffName);
  if (itemsError) return { data: null, error: itemsError };

  return { data, error: null };
}

export async function appendOrdersToTable(
  tableId: string,
  newOrders: OrderItem[],
  staffId?: string,
  staffName?: string,
) {
  const { data: table, error: fetchError } = await supabase
    .from("tables")
    .select("*")
    .eq("id", tableId)
    .single();

  if (fetchError) return { data: null, error: fetchError };
  if (!table) return { data: null, error: new Error("Table not found") };

  const existingOrders = (table.orders as OrderItem[] | null) ?? [];
  const mergedOrders = mergeOrderItems(existingOrders, newOrders);

  const { data, error } = await supabase
    .from("tables")
    .update({
      status: "waiting",
      orders: mergedOrders,
    })
    .eq("id", tableId)
    .select("*")
    .single();

  if (error) return { data, error };

  const { error: itemsError } = await insertOrderRowsWithLogs(
    tableId,
    newOrders,
    staffId,
    staffName,
  );
  if (itemsError) return { data: null, error: itemsError };

  return { data, error: null };
}

export async function updateTableOrders(tableId: string, orders: OrderItem[]) {
  const activeOrders = orders.filter((item) => item.quantity > 0);

  if (activeOrders.length === 0) {
    return clearTable(tableId);
  }

  const { data: table, error: fetchError } = await supabase
    .from("tables")
    .select("status")
    .eq("id", tableId)
    .single();

  if (fetchError) return { data: null, error: fetchError };

  const { data, error } = await supabase
    .from("tables")
    .update({
      orders: activeOrders,
      status: table?.status === "ready" ? "ready" : "waiting",
    })
    .eq("id", tableId)
    .select("*")
    .single();

  if (error) return { data, error };

  await supabase.from("order_items").delete().eq("table_id", tableId);

  const orderRows = buildOrderRows(tableId, activeOrders);
  if (orderRows.length > 0) {
    const { error: itemsError } = await supabase.from("order_items").insert(orderRows);
    if (itemsError) return { data: null, error: itemsError };
  }

  return { data, error: null };
}

export async function clearTable(tableId: string) {
  await supabase.from("order_items").delete().eq("table_id", tableId);

  return supabase
    .from("tables")
    .update({
      status: "empty",
      occupied_at: null,
      orders: null,
    })
    .eq("id", tableId)
    .select("*")
    .single();
}

export async function checkoutTable(
  tableId: string,
  tableLabel: string,
  orders: OrderItem[],
  staffId: string | undefined,
  staffName: string,
  payment: CheckoutPaymentRecord,
  options?: {
    remainingOrders?: OrderItem[];
    closeTable?: boolean;
  },
) {
  const ratio =
    payment.splitMode === "equal" && payment.splitCount > 1
      ? 1 / payment.splitCount
      : 1;

  const paidItemIds = orders.map((item) => item.id).filter((id): id is string => Boolean(id));
  let activityLog: Awaited<ReturnType<typeof fetchOrderLogsForItems>>["data"] = [];

  if (paidItemIds.length > 0) {
    const { data: logs } = await fetchOrderLogsForItems(paidItemIds);
    activityLog = logs;
  } else {
    const { data: tableRows } = await supabase
      .from("order_items")
      .select("id")
      .eq("table_id", tableId);
    const tableIds = (tableRows ?? []).map((row) => row.id);
    if (tableIds.length > 0) {
      const { data: logs } = await fetchOrderLogsForItems(tableIds);
      activityLog = logs;
    }
  }

  const { data: activeReservationRow } = await findActiveReservationForTable(tableId);
  const activeReservation = activeReservationRow ? mapReservationRow(activeReservationRow) : null;

  const { error: saleError } = await supabase.from("sales").insert({
    table_id: tableId,
    table_label: tableLabel,
    staff_id: staffId ?? null,
    staff_name: staffName,
    subtotal: Number((payment.subtotal * ratio).toFixed(2)),
    discount_amount: Number((payment.discountAmount * ratio).toFixed(2)),
    discount_type: payment.discountValue > 0 ? payment.discountType : null,
    discount_value: payment.discountValue,
    tip: Number((payment.tip * ratio).toFixed(2)),
    grand_total: Number(payment.amountDueNow.toFixed(2)),
    payment_method: payment.paymentMethod,
    amount_given: payment.amountGiven ?? null,
    change_due: payment.changeDue ?? null,
    split_mode: payment.splitMode,
    split_count: payment.splitCount,
    items: orders,
    reservation_id: activeReservation?.id ?? null,
    guest_name: activeReservation?.guestName ?? null,
    guest_phone: activeReservation?.guestPhone ?? null,
    party_size: activeReservation?.partySize ?? null,
    visit_source: activeReservation?.source ?? null,
    activity_log: activityLog.map((entry) => ({
      id: entry.id,
      orderId: entry.orderId,
      action: entry.action,
      staffName: entry.staffName,
      createdAt: entry.createdAt.toISOString(),
    })),
  });

  if (saleError) return { error: saleError };

  if (options?.closeTable !== false) {
    await completeReservationForTable(tableId);
  }

  if (options?.remainingOrders !== undefined) {
    if (options.remainingOrders.length === 0) {
      return clearTable(tableId);
    }
    return updateTableOrders(tableId, options.remainingOrders);
  }

  if (options?.closeTable === false) {
    return { error: null };
  }

  return clearTable(tableId);
}

export async function transferTable(fromId: string, toId: string) {
  const { data: fromTable, error: fetchError } = await supabase
    .from("tables")
    .select("*")
    .eq("id", fromId)
    .single();
  if (fetchError) return { error: fetchError };
  if (!fromTable) return { error: new Error("Source table not found") };

  await supabase.from("order_items").update({ table_id: toId }).eq("table_id", fromId);

  const { error: updateError } = await supabase
    .from("tables")
    .update({
      status: fromTable.status,
      occupied_at: fromTable.occupied_at,
      orders: fromTable.orders,
    })
    .eq("id", toId);

  if (updateError) return { error: updateError };

  return clearTable(fromId);
}

export async function mergeTables(sourceIds: string[], targetId: string) {
  for (const sourceId of sourceIds) {
    if (sourceId === targetId) continue;
    const { data: source } = await supabase.from("tables").select("*").eq("id", sourceId).single();
    if (!source?.orders) continue;

    const { data: target } = await supabase.from("tables").select("*").eq("id", targetId).single();
    const mergedOrders = [...(target?.orders ?? []), ...(source.orders ?? [])];

    await supabase.from("order_items").update({ table_id: targetId }).eq("table_id", sourceId);
    await supabase
      .from("tables")
      .update({
        status: "waiting",
        orders: mergedOrders,
        occupied_at: target?.occupied_at ?? source.occupied_at,
      })
      .eq("id", targetId);
    await clearTable(sourceId);
  }
  return { error: null as Error | null };
}

export async function updateOrderItemStatus(
  itemId: string,
  status: OrderItem["status"],
  staffName: string,
) {
  const normalized = normalizeOrderItemStatus(status);
  const { error } = await supabase
    .from("order_items")
    .update({ status: normalized, updated_at: new Date().toISOString() })
    .eq("id", itemId);

  if (error) return { error };

  const { error: logError } = await logOrderStatusChange(itemId, normalized, staffName);
  if (logError) {
    console.warn("[OrderLog] Failed to write order_logs entry:", logError.message);
  }

  return { error: null };
}

export async function markTableReadyIfAllDone(tableId: string) {
  const { data: items } = await supabase
    .from("order_items")
    .select("status")
    .eq("table_id", tableId);

  if (!items?.length) return;

  const hasPreparing = items.some(
    (item) => normalizeOrderItemStatus(item.status) === "preparing",
  );
  const allReadyOrServed = items.every((item) => {
    const status = normalizeOrderItemStatus(item.status);
    return status === "ready" || status === "served";
  });

  if (!hasPreparing && allReadyOrServed) {
    await supabase.from("tables").update({ status: "ready" }).eq("id", tableId);
  } else {
    await supabase.from("tables").update({ status: "waiting" }).eq("id", tableId);
  }
}

/** Auto-fire any legacy pending rows to preparing (KDS workflow). */
export async function autoFirePendingItems(staffName: string, station?: OrderItem["station"]) {
  let query = supabase.from("order_items").select("id").eq("status", "pending");
  if (station) query = query.eq("station", station);

  const { data } = await query;
  if (!data?.length) return;

  for (const row of data) {
    await updateOrderItemStatus(row.id, "preparing", staffName);
  }
}

export async function markItemsReady(
  itemIds: string[],
  staffName: string,
  tableId?: string,
) {
  for (const itemId of itemIds) {
    const { error } = await updateOrderItemStatus(itemId, "ready", staffName);
    if (error) return { error };
  }

  if (tableId) {
    await syncTableOrdersFromDb(tableId);
    await markTableReadyIfAllDone(tableId);
  }

  return { error: null };
}

export async function markItemsServed(
  itemIds: string[],
  staffName: string,
  tableId?: string,
) {
  for (const itemId of itemIds) {
    const { error } = await updateOrderItemStatus(itemId, "served", staffName);
    if (error) return { error };
  }

  if (tableId) {
    await syncTableOrdersFromDb(tableId);
  }

  return { error: null };
}

export async function markItemsLate(itemIds: string[], staffName: string) {
  for (const itemId of itemIds) {
    await logOrderStatusChange(itemId, "late", staffName);
  }
  return { error: null };
}

export async function cancelOrderItems(
  itemIds: string[],
  tableId: string,
  reason: string,
  staffName: string,
) {
  for (const itemId of itemIds) {
    await logOrderStatusChange(itemId, `cancelled: ${reason}`, staffName);
    const { error } = await supabase.from("order_items").delete().eq("id", itemId);
    if (error) return { error };
  }

  await syncTableOrdersFromDb(tableId);
  return { error: null };
}

export async function toggleMenuAvailability(menuItemId: string, isAvailable: boolean) {
  return supabase
    .from("menu_items")
    .update({ is_available: isAvailable, sold_out: !isAvailable })
    .eq("id", menuItemId);
}

export async function toggleInventorySoldOut(itemId: string, soldOut: boolean) {
  return supabase.from("inventory_items").update({ sold_out: soldOut }).eq("id", itemId);
}
