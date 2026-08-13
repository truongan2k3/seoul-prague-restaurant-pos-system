import type { CheckoutPaymentRecord } from "@/lib/checkout-calculations";
import {
  autoServeActor,
  isReadyForAutoServe,
  resolveKitchenStatus,
} from "@/lib/auto-serve";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import type { OrderItem, Station } from "@/lib/types";
import { logOrderStatusChange, fetchOrderLogsForItems } from "@/src/lib/order-log-actions";
import {
  fetchTableActivityLogs,
  logTableActivity,
  tableActivityLogsToSnapshot,
} from "@/src/lib/table-activity-log-actions";
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
        entry.skipPrint === item.skipPrint &&
        entry.hideOnKds === item.hideOnKds &&
        normalizeOrderItemStatus(entry.status) === normalizeOrderItemStatus(item.status) &&
        entry.price === item.price &&
        entry.station === item.station,
    );

    if (match) {
      match.quantity += item.quantity;
      if (
        item.createdAt &&
        (!match.createdAt || item.createdAt < match.createdAt)
      ) {
        match.createdAt = item.createdAt;
      }
    } else {
      merged.push({ ...item });
    }
  }

  return merged;
}

function expandOrderToUnits(order: OrderItem): OrderItem[] {
  const units: OrderItem[] = [];
  const normalized = normalizeOrderItemStatus(order.status);
  const extraUnitStatus: OrderItem["status"] =
    normalized === "served" || normalized === "ready" ? "preparing" : normalized;

  for (let index = 0; index < order.quantity; index += 1) {
    units.push({
      ...order,
      quantity: 1,
      id: index === 0 ? order.id : undefined,
      createdAt: index === 0 ? order.createdAt : undefined,
      status: index === 0 ? order.status : extraUnitStatus,
    });
  }
  return units;
}

function kitchenStatusFromOrderStatus(status: OrderItem["status"]): "pending" | "ready" | "served" {
  const normalized = normalizeOrderItemStatus(status);
  if (normalized === "ready") return "ready";
  if (normalized === "served") return "served";
  return "pending";
}

function orderItemRowUpdate(unit: OrderItem) {
  const status = normalizeOrderItemStatus(unit.status ?? "preparing");
  const kitchenStatus = unit.kitchenStatus ?? kitchenStatusFromOrderStatus(status);
  return {
    name: unit.name,
    price: unit.price,
    quantity: 1,
    notes: unit.notes ?? null,
    notes_translated: unit.notesTranslated ?? null,
    is_printed_note: unit.isPrintedNote ?? false,
    skip_print: unit.skipPrint ?? false,
    hide_on_kds: unit.hideOnKds ?? false,
    station: unit.station ?? "kitchen",
    status,
    kitchen_status: kitchenStatus,
    ready_at: unit.readyAt ?? null,
    selected_addons: unit.selectedAddons ?? [],
    menu_item_id: unit.menuItemId ?? null,
    modifiers: unit.modifiers ?? null,
  };
}

function isBillableOrderItem(
  item: Pick<OrderItem, "kitchenStatus" | "status" | "isCancelled">,
): boolean {
  const kitchenStatus = resolveKitchenStatus(item);
  return kitchenStatus !== "cancelled" && kitchenStatus !== "archived" && !item.isCancelled;
}

/** Still cooking / waiting to auto-serve — cancelled alerts must NOT block floor close. */
function isKitchenStillOpen(
  item: Pick<OrderItem, "kitchenStatus" | "status" | "isCancelled" | "hideOnKds">,
): boolean {
  if (item.isCancelled || item.hideOnKds) return false;
  const kitchenStatus = resolveKitchenStatus(item);
  return kitchenStatus === "pending" || kitchenStatus === "ready";
}

async function syncTableOrdersFromDb(tableId: string) {
  const { data: rows } = await supabase
    .from("order_items")
    .select("*")
    .eq("table_id", tableId)
    .order("created_at", { ascending: true });

  if (!rows?.length) {
    const { data: table } = await supabase.from("tables").select("status").eq("id", tableId).single();
    if (table?.status === "empty") return;
    await clearTable(tableId);
    return;
  }

  const mapped = (rows as SupabaseOrderItemRow[]).map(mapOrderItemRow);
  const billable = mapped.filter(isBillableOrderItem);
  const kitchenOpen = mapped.some(isKitchenStillOpen);

  // All lines archived/served and nothing left for KDS — free the table.
  if (billable.length === 0 && !kitchenOpen) {
    await clearTable(tableId);
    return;
  }

  const orders = aggregateOrderItems(billable);

  const hasPreparing = orders.some(
    (item) => normalizeOrderItemStatus(item.status) === "preparing",
  );
  const allReadyOrServed =
    orders.length > 0 &&
    orders.every((item) => {
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

async function logAggregatedItemsActivity(
  tableId: string,
  items: OrderItem[],
  action: "sent_to_kitchen" | "save_no_print",
  staff: { staffId?: string; staffName?: string },
  tableLabel?: string,
) {
  const actor = staff.staffName?.trim() || "Staff";
  for (const item of aggregateOrderItems(items)) {
    const label = item.quantity > 1 ? `${item.quantity}× ${item.name}` : item.name;
    const { error } = await logTableActivity({
      tableId,
      tableLabel,
      orderItemId: item.id,
      itemName: label,
      action,
      staffId: staff.staffId,
      staffName: actor,
    });
    if (error) {
      console.warn("[TableActivityLog] Failed to write entry:", error.message);
    }
  }
}

async function insertOrderRowsWithLogs(
  tableId: string,
  orders: OrderItem[],
  staffId?: string,
  staffName?: string,
  tableLabel?: string,
) {
  const orderRows = buildOrderRows(tableId, orders, staffId);
  if (orderRows.length === 0) return { error: null as Error | null };

  const { data, error } = await supabase.from("order_items").insert(orderRows).select("id");
  if (error) return { error };

  const actor = staffName ?? "Staff";
  for (let index = 0; index < (data ?? []).length; index += 1) {
    const row = data![index];
    const kitchenStatus = orderRows[index]?.kitchen_status ?? "pending";
    const logStatus =
      kitchenStatus === "served" || kitchenStatus === "ready" ? kitchenStatus : "preparing";
    await logOrderStatusChange(row.id, logStatus, actor);
  }

  const sentItems = orders.filter((item) => !(item.skipPrint && item.hideOnKds));
  const savedItems = orders.filter((item) => item.skipPrint && item.hideOnKds);
  if (sentItems.length > 0) {
    await logAggregatedItemsActivity(
      tableId,
      sentItems,
      "sent_to_kitchen",
      { staffId, staffName },
      tableLabel,
    );
  }
  if (savedItems.length > 0) {
    await logAggregatedItemsActivity(
      tableId,
      savedItems,
      "save_no_print",
      { staffId, staffName },
      tableLabel,
    );
  }

  return { error: null as Error | null };
}

function buildOrderRows(tableId: string, orders: OrderItem[], staffId?: string) {
  return orders.flatMap((item) => {
    const status = item.status ?? "preparing";
    return Array.from({ length: item.quantity }, () => ({
      table_id: tableId,
      menu_item_id: item.menuItemId ?? null,
      staff_id: staffId ?? null,
      name: item.name,
      price: item.price,
      quantity: 1,
      notes: item.notes ?? null,
      notes_translated: item.notesTranslated ?? null,
      is_printed_note: item.isPrintedNote ?? false,
      skip_print: item.skipPrint ?? false,
      hide_on_kds: item.hideOnKds ?? false,
      station: item.station ?? "kitchen",
      status,
      kitchen_status: item.kitchenStatus ?? "pending",
      ready_at: item.readyAt ?? null,
      selected_addons: item.selectedAddons ?? [],
      modifiers: item.modifiers ?? null,
    }));
  });
}

export async function occupyTable(
  tableId: string,
  orders: OrderItem[],
  staffId?: string,
  staffName?: string,
  tableLabel?: string,
) {
  const occupiedAt = new Date().toISOString();

  const { error: tableError } = await supabase
    .from("tables")
    .update({
      status: "waiting",
      occupied_at: occupiedAt,
      orders,
      payment_status: "unpaid",
      fulfillment_status: "in_progress",
    })
    .eq("id", tableId);

  if (tableError) return { data: null, error: tableError };

  const { error: itemsError } = await insertOrderRowsWithLogs(
    tableId,
    orders,
    staffId,
    staffName,
    tableLabel,
  );
  if (itemsError) return { data: null, error: itemsError };

  await syncTableOrdersFromDb(tableId);

  return supabase.from("tables").select("*").eq("id", tableId).single();
}

export async function appendOrdersToTable(
  tableId: string,
  newOrders: OrderItem[],
  staffId?: string,
  staffName?: string,
  tableLabel?: string,
) {
  const { data: table, error: fetchError } = await supabase
    .from("tables")
    .select("id, label")
    .eq("id", tableId)
    .single();

  if (fetchError) return { data: null, error: fetchError };
  if (!table) return { data: null, error: new Error("Table not found") };

  const label = tableLabel ?? String((table as { label?: string }).label ?? "");

  const { error: itemsError } = await insertOrderRowsWithLogs(
    tableId,
    newOrders,
    staffId,
    staffName,
    label,
  );
  if (itemsError) return { data: null, error: itemsError };

  await supabase
    .from("tables")
    .update({
      fulfillment_status: "in_progress",
      payment_status: "unpaid",
    })
    .eq("id", tableId);

  await syncTableOrdersFromDb(tableId);

  return supabase.from("tables").select("*").eq("id", tableId).single();
}

export async function updateTableOrders(
  tableId: string,
  orders: OrderItem[],
  options?: {
    staffId?: string;
    staffName?: string;
    tableLabel?: string;
    silent?: boolean;
    printOrders?: OrderItem[];
  },
) {
  const activeOrders = orders.filter((item) => item.quantity > 0);
  const staff = {
    staffId: options?.staffId,
    staffName: options?.staffName,
  };

  const { data: existingRows, error: fetchItemsError } = await supabase
    .from("order_items")
    .select("*")
    .eq("table_id", tableId)
    .order("created_at", { ascending: true });

  if (fetchItemsError) return { data: null, error: fetchItemsError };

  if (activeOrders.length === 0) {
    const openIds = (existingRows ?? [])
      .filter((row) => {
        const status = resolveKitchenStatus({
          status: row.status,
          kitchenStatus: row.kitchen_status ?? undefined,
          isCancelled: Boolean(row.is_cancelled),
        });
        return status !== "archived" && status !== "cancelled" && !row.is_cancelled;
      })
      .map((row) => row.id);

    if (openIds.length > 0) {
      const cancelledAt = new Date().toISOString();
      const { error: cancelError } = await supabase
        .from("order_items")
        .update({
          is_cancelled: true,
          cancel_reason: "Removed from order",
          cancelled_at: cancelledAt,
          kitchen_status: "cancelled",
          updated_at: cancelledAt,
        })
        .in("id", openIds);
      if (cancelError) return { data: null, error: cancelError };
    }

    await syncTableOrdersFromDb(tableId);
    return supabase.from("tables").select("*").eq("id", tableId).single();
  }

  const desiredUnits = activeOrders.flatMap(expandOrderToUnits);
  const existingIds = new Set((existingRows ?? []).map((row) => row.id));
  const desiredIds = new Set(
    desiredUnits.map((unit) => unit.id).filter((id): id is string => Boolean(id)),
  );

  // Soft-delete lines removed from the cart (keep row for KDS red cancel alert).
  const idsToCancel = [...existingIds].filter((id) => !desiredIds.has(id));
  if (idsToCancel.length > 0) {
    const cancelledAt = new Date().toISOString();
    const { error: cancelError } = await supabase
      .from("order_items")
      .update({
        is_cancelled: true,
        cancel_reason: "Removed from order",
        cancelled_at: cancelledAt,
        kitchen_status: "cancelled",
        updated_at: cancelledAt,
      })
      .in("id", idsToCancel)
      .eq("is_cancelled", false)
      .neq("kitchen_status", "archived");
    if (cancelError) return { data: null, error: cancelError };
  }

  for (const unit of desiredUnits) {
    if (!unit.id) continue;
    const { error: updateError } = await supabase
      .from("order_items")
      .update(orderItemRowUpdate(unit))
      .eq("id", unit.id);
    if (updateError) return { data: null, error: updateError };

    if (options?.staffName) {
      const prev = (existingRows ?? []).find((row) => row.id === unit.id);
      if (prev) {
        const prevNotes = `${prev.notes ?? ""}|${prev.notes_translated ?? ""}`;
        const nextNotes = `${unit.notes ?? ""}|${unit.notesTranslated ?? ""}`;
        if (prevNotes !== nextNotes) {
          const { error: logError } = await logTableActivity({
            tableId,
            tableLabel: options.tableLabel,
            orderItemId: unit.id,
            itemName: unit.name,
            action: "add_note",
            staffId: staff.staffId,
            staffName: staff.staffName ?? "Staff",
          });
          if (logError) {
            console.warn("[TableActivityLog] Failed to write note entry:", logError.message);
          }
        }
      }
    }
  }

  const newUnits = desiredUnits.filter((unit) => !unit.id);
  if (newUnits.length > 0) {
    const { error: itemsError } = await insertOrderRowsWithLogs(
      tableId,
      newUnits,
      staff.staffId,
      staff.staffName,
      options?.tableLabel,
    );
    if (itemsError) return { data: null, error: itemsError };
  }

  if (options?.printOrders?.length && options.staffName) {
    await logAggregatedItemsActivity(
      tableId,
      options.printOrders,
      "sent_to_kitchen",
      staff,
      options.tableLabel,
    );
  }

  if (options?.silent && options.staffName) {
    const existingAgg = aggregateOrderItems(
      (existingRows ?? []).map((row) => mapOrderItemRow(row as SupabaseOrderItemRow)),
    );
    const changedSilent: OrderItem[] = [];
    for (const order of activeOrders) {
      if (!order.id) continue;
      const prev = existingAgg.find((entry) => entry.id === order.id);
      if (!prev) continue;
      if (
        prev.quantity !== order.quantity ||
        prev.price !== order.price ||
        (prev.notes ?? "") !== (order.notes ?? "") ||
        (prev.notesTranslated ?? "") !== (order.notesTranslated ?? "")
      ) {
        changedSilent.push(order);
      }
    }
    if (changedSilent.length > 0) {
      await logAggregatedItemsActivity(
        tableId,
        changedSilent,
        "save_no_print",
        staff,
        options.tableLabel,
      );
    }
  }

  await syncTableOrdersFromDb(tableId);

  return supabase.from("tables").select("*").eq("id", tableId).single();
}

export async function clearTable(tableId: string) {
  // Soft-archive cancel alerts first so KDS can drop them; then wipe the table.
  await supabase
    .from("order_items")
    .update({ kitchen_status: "archived", updated_at: new Date().toISOString() })
    .eq("table_id", tableId)
    .eq("kitchen_status", "cancelled");

  await supabase.from("order_items").delete().eq("table_id", tableId);

  return supabase
    .from("tables")
    .update({
      status: "empty",
      occupied_at: null,
      orders: null,
      payment_status: "unpaid",
      fulfillment_status: "in_progress",
    })
    .eq("id", tableId)
    .select("*")
    .single();
}

/** Staff force-close when bill is empty/paid and kitchen is idle (or stuck). */
export async function forceCloseTable(tableId: string) {
  return clearTable(tableId);
}

/**
 * After full payment: keep kitchen tickets on KDS/Bar until auto-serve finishes.
 * Only archive the table when every line is already served.
 */
async function settlePaidTable(tableId: string) {
  const { data: items } = await supabase
    .from("order_items")
    .select("status, kitchen_status, hide_on_kds")
    .eq("table_id", tableId);

  const hasOpenKitchen = (items ?? []).some((item) =>
    isKitchenStillOpen({
      status: item.status,
      kitchenStatus: item.kitchen_status ?? undefined,
      isCancelled: item.kitchen_status === "cancelled",
      hideOnKds: item.hide_on_kds ?? false,
    }),
  );

  if (hasOpenKitchen) {
    return supabase
      .from("tables")
      .update({
        payment_status: "paid",
        fulfillment_status: "in_progress",
      })
      .eq("id", tableId)
      .select("*")
      .single();
  }

  await supabase
    .from("tables")
    .update({
      payment_status: "paid",
      fulfillment_status: "completed",
    })
    .eq("id", tableId);

  return clearTable(tableId);
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

  const { data: tableMeta } = await supabase
    .from("tables")
    .select("occupied_at")
    .eq("id", tableId)
    .maybeSingle();

  await logTableActivity({
    tableId,
    tableLabel,
    action: "checkout",
    staffId: staffId ?? undefined,
    staffName,
    meta: {
      paymentMethod: payment.paymentMethod,
      amount: payment.amountDueNow,
    },
  });

  const since = tableMeta?.occupied_at ? new Date(tableMeta.occupied_at) : undefined;
  const { data: tableActivityLog } = await fetchTableActivityLogs(tableId, since);
  let activityLog = tableActivityLogsToSnapshot(tableActivityLog);

  if (activityLog.length === 0) {
    if (paidItemIds.length > 0) {
      const { data: logs } = await fetchOrderLogsForItems(paidItemIds);
      activityLog = logs.map((entry) => ({
        id: entry.id,
        orderId: entry.orderId,
        itemName: "itemName" in entry ? entry.itemName : undefined,
        action: entry.action,
        staffName: entry.staffName,
        meta: "meta" in entry ? entry.meta : undefined,
        createdAt: entry.createdAt.toISOString(),
      }));
    } else {
      const { data: tableRows } = await supabase
        .from("order_items")
        .select("id")
        .eq("table_id", tableId);
      const tableIds = (tableRows ?? []).map((row) => row.id);
      if (tableIds.length > 0) {
        const { data: logs } = await fetchOrderLogsForItems(tableIds);
        activityLog = logs.map((entry) => ({
          id: entry.id,
          orderId: entry.orderId,
          itemName: "itemName" in entry ? entry.itemName : undefined,
          action: entry.action,
          staffName: entry.staffName,
          meta: "meta" in entry ? entry.meta : undefined,
          createdAt: entry.createdAt.toISOString(),
        }));
      }
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
    card_auth_code: payment.cardAuthCode ?? null,
    card_last4: payment.cardLast4 ?? null,
    card_brand: payment.cardBrand ?? null,
    split_mode: payment.splitMode,
    split_count: payment.splitCount,
    items: orders,
    reservation_id: activeReservation?.id ?? null,
    guest_name: activeReservation?.guestName ?? null,
    guest_phone: activeReservation?.guestPhone ?? null,
    party_size: activeReservation?.partySize ?? null,
    visit_source: activeReservation?.source ?? null,
    activity_log: activityLog,
  });

  if (saleError) return { data: null, error: saleError };

  if (options?.closeTable !== false) {
    await completeReservationForTable(tableId);
  }

  // Partial item-split: unpaid lines remain on the bill.
  if (options?.remainingOrders !== undefined) {
    if (options.remainingOrders.length === 0) {
      return settlePaidTable(tableId);
    }
    return updateTableOrders(tableId, options.remainingOrders);
  }

  // Equal-split installment — leave table open without marking fully paid.
  if (options?.closeTable === false) {
    return { data: null, error: null };
  }

  // Full checkout — keep KDS tickets if kitchen still in progress.
  return settlePaidTable(tableId);
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
  const kitchenStatus = kitchenStatusFromOrderStatus(normalized);
  const patch: Record<string, string | null> = {
    status: normalized,
    kitchen_status: kitchenStatus,
    updated_at: new Date().toISOString(),
  };

  if (kitchenStatus === "ready") {
    patch.ready_at = new Date().toISOString();
  } else if (kitchenStatus === "pending") {
    patch.ready_at = null;
  }

  const { error } = await supabase.from("order_items").update(patch).eq("id", itemId);

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

export async function markItemsPreparing(
  itemIds: string[],
  staffName: string,
  tableId?: string,
) {
  for (const itemId of itemIds) {
    const { error } = await updateOrderItemStatus(itemId, "preparing", staffName);
    if (error) return { error };
  }

  if (tableId) {
    await syncTableOrdersFromDb(tableId);
    await markTableReadyIfAllDone(tableId);
  }

  return { error: null };
}

export async function markTableFulfillmentIfAllServed(tableId: string) {
  const { data: items } = await supabase
    .from("order_items")
    .select("status, kitchen_status")
    .eq("table_id", tableId);

  if (!items?.length) return;

  const allServed = items.every((item) => {
    const kitchenStatus =
      item.kitchen_status === "pending" ||
      item.kitchen_status === "ready" ||
      item.kitchen_status === "served" ||
      item.kitchen_status === "cancelled" ||
      item.kitchen_status === "archived"
        ? item.kitchen_status
        : resolveKitchenStatus({
            status: item.status,
            kitchenStatus: item.kitchen_status ?? undefined,
          });
    return (
      kitchenStatus === "served" ||
      kitchenStatus === "cancelled" ||
      kitchenStatus === "archived"
    );
  });

  if (!allServed) return;

  const { data: table } = await supabase
    .from("tables")
    .select("payment_status")
    .eq("id", tableId)
    .single();

  await supabase
    .from("tables")
    .update({ fulfillment_status: "completed" })
    .eq("id", tableId);

  // Pre-paid takeaway / early pay: archive once kitchen auto-serve finishes.
  if (table?.payment_status === "paid") {
    await clearTable(tableId);
  }
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
    await markTableFulfillmentIfAllServed(tableId);
  }

  return { error: null };
}

/** Auto-serve ready lines whose ready_at is at least 3 minutes old. */
export async function autoServeExpiredReadyItems(station?: Station) {
  let query = supabase
    .from("order_items")
    .select("id, table_id, status, kitchen_status, ready_at")
    .eq("kitchen_status", "ready")
    .not("ready_at", "is", null);

  if (station) query = query.eq("station", station);

  const { data, error } = await query;
  if (error || !data?.length) return { servedIds: [] as string[], error: error ?? null };

  const now = Date.now();
  const expired = data.filter((row) =>
    isReadyForAutoServe(
      {
        status: row.status,
        kitchenStatus: row.kitchen_status ?? undefined,
        readyAt: row.ready_at ?? undefined,
      },
      now,
    ),
  );

  if (expired.length === 0) return { servedIds: [] as string[], error: null };

  const actor = autoServeActor(station);
  const tableIds = new Set<string>();
  const servedIds: string[] = [];

  for (const row of expired) {
    const { error: serveError } = await updateOrderItemStatus(row.id, "served", actor);
    if (serveError) return { servedIds, error: serveError };
    servedIds.push(row.id);
    if (row.table_id) tableIds.add(row.table_id);
  }

  for (const tableId of tableIds) {
    await syncTableOrdersFromDb(tableId);
    await markTableFulfillmentIfAllServed(tableId);
  }

  return { servedIds, error: null };
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
  const cancelledAt = new Date().toISOString();
  for (const itemId of itemIds) {
    await logOrderStatusChange(itemId, `cancelled: ${reason}`, staffName);
    const { error } = await supabase
      .from("order_items")
      .update({
        is_cancelled: true,
        cancel_reason: reason,
        cancelled_at: cancelledAt,
        kitchen_status: "cancelled",
        updated_at: cancelledAt,
      })
      .eq("id", itemId);
    if (error) return { error };
  }

  await syncTableOrdersFromDb(tableId);
  return { error: null };
}

/** Kitchen acknowledges a cancelled line — hide permanently from KDS/Bar. */
export async function acknowledgeCancelledItems(itemIds: string[], staffName: string) {
  const updatedAt = new Date().toISOString();
  const tableIds = new Set<string>();

  for (const itemId of itemIds) {
    await logOrderStatusChange(itemId, "cancel_acknowledged", staffName);
    const { data, error } = await supabase
      .from("order_items")
      .update({
        kitchen_status: "archived",
        updated_at: updatedAt,
      })
      .eq("id", itemId)
      .select("table_id")
      .single();
    if (error) return { error };
    if (data?.table_id) tableIds.add(data.table_id);
  }

  for (const tableId of tableIds) {
    await syncTableOrdersFromDb(tableId);
    await markTableFulfillmentIfAllServed(tableId);
  }

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
