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
  grand_total: number | null;
  voucher_discount_amount: number | null;
  payment_method: PaymentMethod;
  amount_given: number | null;
  activity_log: unknown;
};

/** Update tip and/or bill payment method on a completed sale; append audit to activity_log. */
export async function updateSaleTipRecord(
  saleId: string,
  input: {
    tip: number;
    tipPaymentMethod: PaymentMethod;
    paymentMethod: PaymentMethod;
  },
) {
  const businessSession = await readAuthSession();
  const staffSession = await readStaffSession();
  if (!businessSession || !staffSession || businessSession.businessId !== staffSession.businessId) {
    return { data: null, error: new Error("Staff login required.") };
  }
  if (!Number.isFinite(input.tip) || input.tip < 0 || !["cash","card"].includes(input.paymentMethod) || !["cash","card"].includes(input.tipPaymentMethod)) {
    return { data: null, error: new Error("Enter a valid tip and payment method.") };
  }

  const admin = createSupabaseAdmin();
  const { data: row, error: lookupError } = await admin
    .from("sales")
    .select(
      "id, subtotal, discount_amount, tip, tip_payment_method, payment_method, grand_total, voucher_discount_amount, amount_given, activity_log",
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
  const previousPaymentMethod = sale.payment_method as PaymentMethod;
  const nextTip = Math.max(0, Number(input.tip.toFixed(2)));
  const nextTipPaymentMethod = input.tipPaymentMethod;
  const nextPaymentMethod = input.paymentMethod;

  if (
    previousTip === nextTip &&
    previousTipPaymentMethod === nextTipPaymentMethod &&
    previousPaymentMethod === nextPaymentMethod
  ) {
    return { data: null, error: new Error("No changes to save.") };
  }

  const subtotal = Number(sale.subtotal);
  const discountAmount = Number(sale.discount_amount ?? 0);
  const voucherCredit = Math.max(0, Number(sale.voucher_discount_amount ?? 0));
  const previousGrandTotal = sale.grand_total != null && Number.isFinite(Number(sale.grand_total))
    ? Number(sale.grand_total)
    : Math.max(0, subtotal - discountAmount - voucherCredit) + previousTip;
  // A tip edit changes only the tip delta; keep recorded voucher credit and rounding.
  const grandTotal = Math.max(0, Number((previousGrandTotal - previousTip + nextTip).toFixed(2)));

  const payload: Record<string, unknown> = {
    tip: nextTip,
    tip_payment_method: nextTipPaymentMethod,
    payment_method: nextPaymentMethod,
    grand_total: Number(grandTotal.toFixed(2)),
  };

  if (nextPaymentMethod === "cash") {
    const cashDue = nextTipPaymentMethod === "cash" ? grandTotal : Math.max(0, grandTotal - nextTip);
    const amountGiven =
      previousPaymentMethod === "cash" && sale.amount_given != null
        ? Number(sale.amount_given)
        : cashDue;
    payload.amount_given = Number(amountGiven.toFixed(2));
    payload.change_due = Number(Math.max(0, amountGiven - cashDue).toFixed(2));
    payload.card_auth_code = null;
    payload.card_last4 = null;
    payload.card_brand = null;
  } else {
    payload.amount_given = null;
    payload.change_due = null;
    if (previousPaymentMethod !== "card") {
      payload.card_auth_code = null;
      payload.card_last4 = null;
      payload.card_brand = null;
    }
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
      previousPaymentMethod,
      newPaymentMethod: nextPaymentMethod,
      previousCollected: previousGrandTotal,
      newCollected: grandTotal,
      voucherCredit,
    },
    createdAt: new Date().toISOString(),
  };

  payload.activity_log = [...existingLog, activityEntry];

  let update = admin
    .from("sales")
    .update(payload)
    .eq("id", saleId)
    .is("deleted_at", null)
    .eq("payment_method", previousPaymentMethod);
  update = sale.tip == null ? update.is("tip", null) : update.eq("tip", sale.tip);
  update = sale.tip_payment_method == null ? update.is("tip_payment_method", null) : update.eq("tip_payment_method", sale.tip_payment_method);
  update = sale.grand_total == null ? update.is("grand_total", null) : update.eq("grand_total", sale.grand_total);
  const { data, error } = await update
    .select(
      "id, table_label, staff_name, subtotal, discount_amount, tip, tip_payment_method, grand_total, payment_method, amount_given, change_due, split_mode, split_count, voucher_discount_amount, voucher_codes, items, activity_log, closed_at, seated_at, deleted_at, reservation_id, guest_name, guest_phone, party_size, visit_source, service_channel",
    )
    .single();

  if (error) return { data: null, error: error.code === "PGRST116" ? new Error("Payment changed on another device. Reopen the bill before editing its tip.") : error };

  return { data, error: null };
}
