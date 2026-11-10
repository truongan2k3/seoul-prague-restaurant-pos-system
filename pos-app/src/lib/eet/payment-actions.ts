"use server";

import { after } from "next/server";
import { eetActor } from "./auth";
import { commitValidatedEetSale, eetReferralAuthorization, paymentFingerprint } from "./payment-service";
import { commitReferralSaleAction } from "@/src/lib/referral-actions";
import type { ReferralPayment } from "@/lib/referrals";
import type { OrderItem } from "@/lib/types";
import type { EetCheckoutContext, EetPaymentIntent } from "./types";
import { runEetWorker } from "./worker";

const SALE_FIELDS = new Set(["table_id", "table_label", "staff_id", "staff_name", "subtotal", "discount_amount", "discount_type", "discount_value", "tip", "tip_payment_method", "grand_total", "payment_method", "amount_given", "change_due", "card_auth_code", "card_last4", "card_brand", "split_mode", "split_count", "voucher_discount_amount", "voucher_codes", "items", "activity_log", "reservation_id", "guest_name", "guest_phone", "party_size", "visit_source", "service_channel", "seated_at", "item_transfer_closes_bill", "referral_equal_scope"]);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function getEetCheckoutContextAction(tableId: string): Promise<{ context: EetCheckoutContext | null; error: string | null }> {
  if (process.env.EET_CHECKOUT_ENABLED !== "true") return { context: { enabled: false, tableId, visit: null, revision: 0, pendingKey: null, mode: "disabled", control: "paused" }, error: null };
  try {
    const { db, businessId } = await eetActor();
    if (!uuid(tableId)) throw new Error("Invalid table.");
    const [table, settings] = await Promise.all([
      db.from("tables").select("occupied_at,eet_payment_revision,eet_settlement_key").eq("id", tableId).single(),
      db.from("eet_settings").select("mode,submission_control").eq("business_id", businessId).maybeSingle(),
    ]);
    if (table.error || settings.error) throw new Error("Secure checkout schema unavailable.");
    return { context: { enabled: true, tableId, visit: table.data.occupied_at, revision: table.data.eet_payment_revision,
      pendingKey: table.data.eet_settlement_key, mode: settings.data?.mode ?? "disabled", control: settings.data?.submission_control ?? "paused" }, error: null };
  } catch { return { context: null, error: "Secure EET checkout unavailable. Check staff login and server configuration before confirming payment." }; }
}

async function finishEetSettlement(tableId: string, key: string) {
  const { db } = await eetActor();
  const { error } = await db.rpc("eet_finish_settlement", { p_table: tableId, p_key: key });
  if (error) throw new Error("Payment is recorded. Settlement recovery is required; do not take payment again.");
}

async function resumeSettlement(context: Awaited<ReturnType<typeof eetActor>>, id: string) {
  const { data: sale, error } = await context.db.from("sales").select("table_id,seated_at,eet_visit_revision,eet_payment_key,eet_settlement_payload")
    .eq("id", id).eq("eet_business_id", context.businessId).single();
  if (error || !sale?.eet_settlement_payload) throw new Error("Recorded payment recovery data unavailable.");
  const { data: table, error: tableError } = await context.db.from("tables").select("occupied_at,eet_settlement_key,eet_payment_revision")
    .eq("id", sale.table_id).single();
  if (tableError) throw new Error("Could not verify payment settlement.");
  if (table.eet_settlement_key !== sale.eet_payment_key) return { data: null, error: null };
  // A table may already have cleared just before the response was lost. Never touch a later visit.
  if (table.occupied_at !== sale.seated_at || table.eet_payment_revision !== sale.eet_visit_revision + 1) {
    await finishEetSettlement(sale.table_id, sale.eet_payment_key);
    return { data: null, error: null };
  }
  const { settleConfirmedCheckout } = await import("@/src/lib/table-actions");
  const snapshot = sale.eet_settlement_payload as { reservationId?: string; remainingOrders?: OrderItem[]; closeTable?: boolean };
  const settled = await settleConfirmedCheckout(sale.table_id, snapshot.reservationId, snapshot);
  if (settled.error) throw new Error("Payment is recorded but table settlement failed. Recover the recorded payment; do not pay again.");
  await finishEetSettlement(sale.table_id, sale.eet_payment_key);
  return settled;
}

export async function recoverEetSettlementAction(tableId: string) {
  const context = await eetActor();
  if (!uuid(tableId)) throw new Error("Invalid table.");
  const { data: table, error } = await context.db.from("tables").select("eet_settlement_key").eq("id", tableId).single();
  if (error || !table.eet_settlement_key) throw new Error("No recorded payment needs recovery.");
  const { data: sale } = await context.db.from("sales").select("id").eq("eet_payment_key", table.eet_settlement_key).eq("eet_business_id", context.businessId).single();
  if (!sale) throw new Error("Recorded payment access denied.");
  await resumeSettlement(context, sale.id);
  const { error: auditError } = await context.db.from("eet_audit_logs").insert({ business_id: context.businessId, actor_id: context.staff.id, action: "payment_settlement_recovered", details: { sale_id: sale.id } });
  if (auditError) throw new Error("Settlement completed; audit persistence failed.");
}

/** Feature off returns control to the original checkout, without reading EET schema or secrets. */
export async function commitEetCheckoutAction(sale: Record<string, unknown>, referral: ReferralPayment | undefined, intent: EetPaymentIntent | undefined,
  settlement: { remainingOrders?: OrderItem[]; closeTable?: boolean }) {
  if (process.env.EET_CHECKOUT_ENABLED !== "true") return { handled: false as const };
  try {
    const context = await eetActor();
    const { db, businessId } = context;
    if (!intent || !uuid(intent.key) || !Number.isInteger(intent.expectedRevision) || intent.expectedRevision < 0 || !uuid(sale.table_id) || Object.keys(sale).some(key => !SALE_FIELDS.has(key))) throw new Error("Refresh checkout to obtain a valid payment context.");
    const fingerprint = paymentFingerprint({ table: sale.table_id, visit: intent.expectedVisit, revision: intent.expectedRevision,
      method: sale.payment_method, subtotal: sale.subtotal, discount: sale.discount_amount, tip: sale.tip, total: sale.grand_total,
      split: sale.split_mode, count: sale.split_count, items: sale.items, settlement });
    const { data: existing, error: existingError } = await db.from("sales").select("id,eet_payment_fingerprint,eet_business_id").eq("eet_payment_key", intent.key).maybeSingle();
    if (existingError) throw new Error("Secure checkout migration is unavailable.");
    if (existing) {
      if (existing.eet_business_id !== businessId || existing.eet_payment_fingerprint !== fingerprint) throw new Error("A payment with this key was already recorded. Recover it before taking another payment.");
      return { handled: true as const, ...await resumeSettlement(context, existing.id) };
    }
    for (const name of ["subtotal", "discount_amount", "tip", "grand_total", "voucher_discount_amount"]) {
      const amount = Number(sale[name] ?? 0);
      if (!Number.isFinite(amount) || amount < 0 || amount > 99_999_999.99) throw new Error("Invalid payment amount.");
    }
    if (!["cash", "card"].includes(String(sale.payment_method)) || !["total", "items", "equal"].includes(String(sale.split_mode))) throw new Error("Invalid payment type.");
    const { data: table, error } = await db.from("tables").select("label,occupied_at,status,eet_payment_revision,payment_status").eq("id", sale.table_id).single();
    if (error || !table || table.status === "empty" || table.payment_status === "paid" || table.occupied_at !== intent.expectedVisit || table.eet_payment_revision !== intent.expectedRevision) throw new Error("The active table/payment changed. Refresh checkout.");
    const { data: live, error: liveError } = await db.from("order_items").select("id,name,price,quantity,kitchen_status,status,is_cancelled,is_printed_note")
      .eq("table_id", sale.table_id);
    if (liveError || !live) throw new Error("Could not verify current orders.");
    const items = sale.items as OrderItem[];
    if (!Array.isArray(items) || !items.length || items.length > 1000) throw new Error("The order is empty or invalid.");
    const divisor = sale.split_mode === "equal" ? Number(sale.split_count) : 1;
    if (!Number.isInteger(divisor) || divisor < 1 || divisor > 20) throw new Error("Invalid split payment.");
    const used = new Map<string, number>();
    let verifiedSubtotal = 0;
    for (const item of items) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.price) || item.price < 0) throw new Error("Invalid payment lines.");
      let remaining = item.quantity;
      const ids = item.unitIds?.length ? item.unitIds : item.id ? [item.id] : [];
      for (const id of ids) {
        const row = live.find(row => row.id === id && !row.is_cancelled && !["cancelled", "archived"].includes(row.kitchen_status ?? row.status));
        if (!row || Math.abs(Number((Number(row.price) / divisor).toFixed(2)) - item.price) > 0.001) throw new Error("Order changed. Refresh checkout.");
        const quantity = Math.min(remaining, Number(row.quantity) - (used.get(id) ?? 0));
        if (quantity > 0) { used.set(id, (used.get(id) ?? 0) + quantity); remaining -= quantity; }
      }
      if (remaining > 0.00001) throw new Error("Duplicate or unavailable payment quantities.");
      verifiedSubtotal += item.price * item.quantity;
    }
    if (Math.abs(verifiedSubtotal - Number(sale.subtotal)) > 1) throw new Error("Payment subtotal changed.");
    if (sale.split_mode !== "items" && live.some(row => !row.is_cancelled && !row.is_printed_note && !["cancelled", "archived"].includes(row.kitchen_status ?? row.status) && (used.get(row.id) ?? 0) !== Number(row.quantity))) throw new Error("The current order has unpaid lines. Refresh checkout.");
    if (sale.split_mode === "items") {
      const unpaid = new Map<string, number>();
      for (const line of settlement.remainingOrders ?? []) {
        if (!Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.price)) throw new Error("Invalid unpaid order quantities.");
        let remaining = line.quantity;
        for (const id of line.unitIds?.length ? line.unitIds : line.id ? [line.id] : []) {
          const row = live.find(r => r.id === id && !r.is_cancelled && !["cancelled", "archived"].includes(r.kitchen_status ?? r.status));
          if (!row || Number(row.price) !== line.price) throw new Error("Unpaid order lines changed.");
          const quantity = Math.min(remaining, Number(row.quantity) - (used.get(id) ?? 0) - (unpaid.get(id) ?? 0));
          if (quantity > 0) { unpaid.set(id, (unpaid.get(id) ?? 0) + quantity); remaining -= quantity; }
        }
        if (remaining > 0.00001) throw new Error("Unpaid quantities changed.");
      }
      if (live.some(row => !row.is_cancelled && !row.is_printed_note && !["cancelled", "archived"].includes(row.kitchen_status ?? row.status) &&
        (used.get(row.id) ?? 0) + (unpaid.get(row.id) ?? 0) !== Number(row.quantity))) throw new Error("Unpaid order lines must be preserved.");
      if ((settlement.closeTable !== false) !== (unpaid.size === 0)) throw new Error("The bill cannot close while unpaid items remain.");
    } else if (settlement.remainingOrders !== undefined) throw new Error("Unexpected unpaid-item settlement.");
    if (sale.split_mode === "equal") {
      let paidQuery = db.from("sales").select("id", { count: "exact", head: true }).eq("table_id", sale.table_id).eq("split_mode", "equal").is("deleted_at", null);
      paidQuery = table.occupied_at ? paidQuery.eq("seated_at", table.occupied_at) : paidQuery.is("seated_at", null);
      const paid = await paidQuery;
      if (paid.error || paid.count === null || paid.count >= divisor) throw new Error("Equal-split progress changed. Refresh checkout.");
      if ((settlement.closeTable !== false) !== (paid.count + 1 >= divisor)) throw new Error("Equal-split completion changed. Refresh checkout.");
    } else if (sale.split_mode === "total" && settlement.closeTable === false) throw new Error("A total payment must settle the bill.");
    const expectedTotal = Math.max(0, Number(sale.subtotal) - Number(sale.discount_amount) - Number(sale.voucher_discount_amount ?? 0)) + Number(sale.tip);
    if (Math.abs(expectedTotal - Number(sale.grand_total)) > 1) throw new Error("Payment totals changed.");
    if (sale.payment_method === "cash" && sale.amount_given != null && Number(sale.amount_given) + 0.01 < Number(sale.grand_total)) throw new Error("Insufficient cash payment.");
    sale = { ...sale, table_label: table.label, seated_at: table.occupied_at, eet_payment_fingerprint: fingerprint,
      eet_payment_key: intent.key, eet_settlement_payload: { ...settlement, reservationId: sale.reservation_id } };
    let saleId: string;
    if (referral) {
      const referred = await commitReferralSaleAction(sale, referral, intent, eetReferralAuthorization(sale, intent));
      if (referred.error || !referred.id) throw new Error(referred.error ?? "Referral payment failed.");
      saleId = referred.id;
    } else {
      delete sale.referral_equal_scope;
      const saved = await commitValidatedEetSale(context, sale, intent);
      saleId = saved.id;
    }
    // Vercel keeps this invocation alive. Durable external scheduling remains the recovery path.
    after(async () => { try { await runEetWorker(); } catch { /* Durable lease/queue preserves recovery. */ } });
    return { handled: true as const, ...await resumeSettlement(context, saleId) };
  } catch (error) {
    return { handled: true as const, data: null, error: error instanceof Error ? error.message : "Secure payment failed." };
  }
}

