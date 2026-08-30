"use server";

import { TIP_EDIT_ACTIVITY_ACTION } from "@/lib/order-activity";
import type { PaymentMethod } from "@/lib/types";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

type SaleRowForTipEdit = {
  id: string;
  subtotal: number;
  discount_amount: number | null;
  tip: number | null;
  tip_payment_method: PaymentMethod | null;
  payment_method: PaymentMethod;
  amount_given: number | null;
  activity_log: unknown;
};

/** Update tip on a completed sale and append an audit entry to activity_log. */
export async function updateSaleTipRecord(
  saleId: string,
  input: {
    tip: number;
    tipPaymentMethod: PaymentMethod;
  },
) {
  const businessSession = await readAuthSession();
  const staffSession = await readStaffSession();
  if (!businessSession || !staffSession) {
    return { data: null, error: new Error("Staff login required.") };
  }

  const admin = createSupabaseAdmin();
  const { data: row, error: lookupError } = await admin
    .from("sales")
    .select(
      "id, subtotal, discount_amount, tip, tip_payment_method, payment_method, amount_given, activity_log",
    )
    .eq("id", saleId)
    .is("deleted_at", null)
    .maybeSingle();

  if (lookupError || !row) {
    return { data: null, error: lookupError ?? new Error("Sale not found.") };
  }

  const sale = row as SaleRowForTipEdit;
  const previousTip = Number(sale.tip ?? 0);
  const previousTipPaymentMethod = (sale.tip_payment_method ?? sale.payment_method) as PaymentMethod;
  const nextTip = Math.max(0, Number(input.tip.toFixed(2)));
  const nextTipPaymentMethod = input.tipPaymentMethod;

  if (previousTip === nextTip && previousTipPaymentMethod === nextTipPaymentMethod) {
    return { data: null, error: new Error("No tip changes to save.") };
  }

  const subtotal = Number(sale.subtotal);
  const discountAmount = Number(sale.discount_amount ?? 0);
  const grandTotal = Math.max(0, subtotal - discountAmount) + nextTip;

  const payload: Record<string, unknown> = {
    tip: nextTip,
    tip_payment_method: nextTipPaymentMethod,
    grand_total: Number(grandTotal.toFixed(2)),
  };

  if (sale.payment_method === "cash" && sale.amount_given != null) {
    const amountGiven = Number(sale.amount_given);
    payload.change_due = Number(Math.max(0, amountGiven - grandTotal).toFixed(2));
  }

  const existingLog = Array.isArray(sale.activity_log) ? sale.activity_log : [];
  const activityEntry = {
    id: crypto.randomUUID(),
    orderId: saleId,
    action: TIP_EDIT_ACTIVITY_ACTION,
    staffName: staffSession.staffName,
    meta: {
      previousTip,
      newTip: nextTip,
      previousTipPaymentMethod,
      newTipPaymentMethod: nextTipPaymentMethod,
    },
    createdAt: new Date().toISOString(),
  };

  payload.activity_log = [...existingLog, activityEntry];

  const { data, error } = await admin
    .from("sales")
    .update(payload)
    .eq("id", saleId)
    .is("deleted_at", null)
    .select(
      "id, table_label, staff_name, subtotal, discount_amount, tip, tip_payment_method, grand_total, payment_method, amount_given, change_due, split_mode, split_count, items, activity_log, closed_at, seated_at, deleted_at, reservation_id, guest_name, guest_phone, party_size, visit_source, service_channel",
    )
    .single();

  if (error) return { data: null, error };

  return { data, error: null };
}
