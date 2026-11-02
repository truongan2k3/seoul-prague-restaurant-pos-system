"use server";

import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import type { ItemTransferHistory, ItemTransferReason, TransferableItem, TransferSelection } from "@/lib/item-transfers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function transferActor() {
  const [auth, session] = await Promise.all([readAuthSession(), readStaffSession()]);
  if (!auth || !session || auth.businessId !== session.businessId) throw new Error("Staff login required to transfer items.");
  const db = createSupabaseAdmin();
  const { data, error } = await db.from("staff").select("id,role").eq("id", session.staffId).eq("business_id", auth.businessId).eq("active", true).single();
  if (error || !data || !["admin", "manager", "cashier", "server"].includes(data.role)) throw new Error("You do not have permission to transfer items.");
  return { db, actorId: data.id, businessId: auth.businessId };
}
function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /item_transfers|item_transfer_version|transfer_order_items|schema cache/i.test(message)
    ? "Apply supabase/patch-item-transfers.sql in Supabase before using Transfer Items." : message;
}

export async function getItemTransferContextAction(tableId: string): Promise<{ items: TransferableItem[]; history: ItemTransferHistory[]; error: string | null }> {
  try {
    if (!UUID.test(tableId)) throw new Error("Invalid table.");
    const { db, businessId } = await transferActor();
    const [table, rows, history] = await Promise.all([
      db.from("tables").select("id,item_transfer_version,payment_status").eq("id", tableId).single(),
      db.from("order_items").select("*").eq("table_id", tableId).order("created_at", { ascending: false }),
      db.from("item_transfers").select("id,source_table_id,destination_table_id,source_label,destination_label,actor_name,created_at,amount,reason,note,event_kind,reversal_of,items").eq("business_id", businessId).or(`source_table_id.eq.${tableId},destination_table_id.eq.${tableId}`).order("created_at", { ascending: false }).limit(30),
    ]);
    if (table.error || rows.error || history.error) throw new Error(table.error?.message ?? rows.error?.message ?? history.error?.message);
    const records = (history.data ?? []) as ItemTransferHistory[];
    const ids = records.filter(row => row.event_kind === "TRANSFER_ORDER_ITEM").map(row => row.id);
    const reversals = ids.length ? await db.from("item_transfers").select("reversal_of").eq("business_id", businessId).in("reversal_of", ids) : null;
    if (reversals?.error) throw new Error(reversals.error.message);
    const reversed = new Set(reversals?.data?.map(row => row.reversal_of));
    return {
      items: table.data.payment_status === "paid" ? [] : (rows.data ?? []).filter(row => !row.is_cancelled && !["archived", "cancelled"].includes(row.kitchen_status) && !row.is_printed_note && !row.modifiers?.kitchenMessage && row.quantity > 0)
        .map(row => ({ id: row.id, name: row.name, price: Number(row.price), quantity: row.quantity, notes: row.notes, status: row.kitchen_status ?? row.status, expected: row })),
      history: records.map(row => ({ ...row, amount: Number(row.amount), reversed: reversed.has(row.id),
        items: row.items.map(item => ({ before: { id: item.before.id, name: item.before.name }, movedId: item.movedId, quantity: item.quantity })),
      })), error: null,
    };
  } catch (error) { return { items: [], history: [], error: errorMessage(error) }; }
}

export async function transferOrderItemsAction(input: { requestId: string; sourceId: string; destinationId: string; items: TransferSelection[]; reason: ItemTransferReason; note: string; undoId?: string }) {
  try {
    if (![input.requestId, input.sourceId, input.destinationId, ...(input.undoId ? [input.undoId] : [])].every(id => UUID.test(id)) || input.sourceId === input.destinationId) throw new Error("Select different source and destination tables.");
    if (!input.undoId && (!Array.isArray(input.items) || !input.items.length || input.items.length > 200 || input.items.some(item => !UUID.test(item.id) || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || !item.expected))) throw new Error("Select valid unpaid quantities.");
    if (!["wrong_table", "customer_moved", "split_group", "other"].includes(input.reason) || input.note.length > 1000) throw new Error("Invalid transfer reason.");
    const { db, actorId, businessId } = await transferActor();
    const { data, error } = await db.rpc("transfer_order_items", {
      p_request: input.requestId, p_source: input.sourceId, p_destination: input.destinationId, p_items: input.items,
      p_actor: actorId, p_business: businessId, p_reason: input.reason, p_note: input.note.trim(), p_undo: input.undoId ?? null,
    });
    if (error) throw new Error(error.message);
    return { id: data.id as string, error: null };
  } catch (error) { return { id: null, error: errorMessage(error) }; }
}
