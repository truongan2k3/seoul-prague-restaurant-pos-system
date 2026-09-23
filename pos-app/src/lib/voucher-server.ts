import QRCode from "qrcode";
import {
  buildCzechSpdPayload,
  buildVoucherPaymentMessage,
  createVoucherCode,
  createVoucherOrderId,
  DEFAULT_VOUCHER_CONFIG,
  parseVoucherConfig,
  variableSymbolFromOrderId,
  voucherConfigToDb,
  VOUCHER_PAYMENT_WINDOW_MINUTES,
  type VoucherCode,
  type VoucherConfig,
  type VoucherOrder,
  type VoucherPaymentMethod,
} from "@/lib/voucher";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import {
  sendVoucherConfirmationEmail,
  sendVoucherIssuedEmail,
} from "@/src/lib/voucher-email";

type OrderRow = {
  id: string;
  order_id: string;
  buyer_name: string;
  buyer_email: string;
  denomination_czk: number;
  quantity: number;
  total_czk: number;
  payment_method: VoucherPaymentMethod;
  payment_status: string;
  order_status: string;
  payment_message: string | null;
  notes: string | null;
  payment_expires_at: string | null;
  guest_marked_paid_at: string | null;
  public_token: string | null;
  verified_at: string | null;
  verified_by_staff_id: string | null;
  verified_by_staff_name: string | null;
  issued_at: string | null;
  created_at: string;
  updated_at: string;
};

type CodeRow = {
  id: string;
  order_uuid: string;
  code: string;
  denomination_czk: number;
  status: string;
  expires_at: string | null;
  redeemed_at: string | null;
  redeemed_by_staff_id: string | null;
  redeemed_by_staff_name: string | null;
  redeemed_table_label: string | null;
  created_at: string;
};

function mapOrder(row: OrderRow, codes?: VoucherCode[]): VoucherOrder {
  return {
    id: row.id,
    orderId: row.order_id,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    denominationCzk: row.denomination_czk,
    quantity: row.quantity,
    totalCzk: row.total_czk,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status as VoucherOrder["paymentStatus"],
    orderStatus: row.order_status as VoucherOrder["orderStatus"],
    paymentMessage: row.payment_message ?? undefined,
    notes: row.notes ?? undefined,
    paymentExpiresAt: row.payment_expires_at,
    guestMarkedPaidAt: row.guest_marked_paid_at,
    verifiedAt: row.verified_at,
    verifiedByStaffName: row.verified_by_staff_name,
    issuedAt: row.issued_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    codes,
  };
}

function createPublicToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cancel pending orders past the payment window when guest never marked paid. */
export async function expireOverdueVoucherOrders(): Promise<number> {
  const admin = createSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("voucher_orders")
    .update({
      payment_status: "cancelled",
      order_status: "cancelled",
      updated_at: nowIso,
      notes: "Auto-cancelled: payment window expired",
    })
    .eq("payment_status", "pending")
    .is("guest_marked_paid_at", null)
    .lt("payment_expires_at", nowIso)
    .select("id");

  if (error || !data) return 0;
  for (const row of data as { id: string }[]) {
    await writeAudit({
      orderUuid: row.id,
      action: "cancelled",
      meta: { reason: "payment_window_expired" },
    });
  }
  return data.length;
}

function mapCode(row: CodeRow): VoucherCode {
  return {
    id: row.id,
    orderUuid: row.order_uuid,
    code: row.code,
    denominationCzk: row.denomination_czk,
    status: row.status as VoucherCode["status"],
    expiresAt: row.expires_at,
    redeemedAt: row.redeemed_at,
    redeemedByStaffName: row.redeemed_by_staff_name,
    redeemedTableLabel: row.redeemed_table_label,
    createdAt: row.created_at,
  };
}

async function writeAudit(input: {
  orderUuid?: string | null;
  voucherCodeId?: string | null;
  action: string;
  staffId?: string | null;
  staffName?: string | null;
  meta?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdmin();
  await admin.from("voucher_audit_logs").insert({
    order_uuid: input.orderUuid ?? null,
    voucher_code_id: input.voucherCodeId ?? null,
    action: input.action,
    staff_id: input.staffId ?? null,
    staff_name: input.staffName ?? null,
    meta: input.meta ?? {},
  });
}

export async function fetchVoucherConfigServer(): Promise<VoucherConfig> {
  const admin = createSupabaseAdmin();
  const { data } = await admin.from("settings").select("voucher_config").limit(1).maybeSingle();
  return parseVoucherConfig((data as { voucher_config?: unknown } | null)?.voucher_config);
}

export async function saveVoucherConfigServer(
  config: VoucherConfig,
): Promise<{ error: string | null }> {
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("settings")
    .update({ voucher_config: voucherConfigToDb(config) })
    .eq("id", 1);
  return { error: error?.message ?? null };
}

export async function buildPaymentQrDataUrl(
  config: VoucherConfig,
  totalCzk: number,
  orderId: string,
): Promise<{ spd: string | null; qrDataUrl: string | null }> {
  const message = buildVoucherPaymentMessage(orderId);
  const spd = buildCzechSpdPayload({
    iban: config.iban,
    amountCzk: totalCzk,
    message,
    variableSymbol: variableSymbolFromOrderId(orderId),
  });
  if (!spd) return { spd: null, qrDataUrl: null };
  try {
    const qrDataUrl = await QRCode.toDataURL(spd, {
      type: "image/png",
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0B0B0C", light: "#FFFFFF" },
    });
    return { spd, qrDataUrl };
  } catch {
    return { spd, qrDataUrl: null };
  }
}

export async function createVoucherOrder(input: {
  buyerName: string;
  buyerEmail: string;
  denominationCzk: number;
  quantity: number;
  paymentMethod: VoucherPaymentMethod;
}): Promise<{
  order: VoucherOrder | null;
  qrDataUrl: string | null;
  spd: string | null;
  publicToken: string | null;
  error: string | null;
}> {
  const config = await fetchVoucherConfigServer();
  if (!config.enabled) {
    return {
      order: null,
      qrDataUrl: null,
      spd: null,
      publicToken: null,
      error: "Voucher sales are currently disabled.",
    };
  }

  const name = input.buyerName.trim();
  const email = input.buyerEmail.trim().toLowerCase();
  if (!name) {
    return { order: null, qrDataUrl: null, spd: null, publicToken: null, error: "Please enter your name." };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      order: null,
      qrDataUrl: null,
      spd: null,
      publicToken: null,
      error: "Please enter a valid email.",
    };
  }

  const denomination = Math.round(Number(input.denominationCzk));
  if (!config.denominationsCzk.includes(denomination)) {
    return {
      order: null,
      qrDataUrl: null,
      spd: null,
      publicToken: null,
      error: "Invalid voucher amount.",
    };
  }

  const quantity = Math.round(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 50) {
    return {
      order: null,
      qrDataUrl: null,
      spd: null,
      publicToken: null,
      error: "Quantity must be between 1 and 50.",
    };
  }

  const paymentMethod: VoucherPaymentMethod =
    input.paymentMethod === "czech_qr" ? "czech_qr" : "bank_transfer";

  const totalCzk = denomination * quantity;
  const orderId = createVoucherOrderId();
  const paymentMessage = buildVoucherPaymentMessage(orderId);
  const now = new Date();
  const nowIso = now.toISOString();
  const paymentExpiresAt = new Date(
    now.getTime() + VOUCHER_PAYMENT_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();
  const publicToken = createPublicToken();

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("voucher_orders")
    .insert({
      order_id: orderId,
      buyer_name: name,
      buyer_email: email,
      denomination_czk: denomination,
      quantity,
      total_czk: totalCzk,
      payment_method: paymentMethod,
      payment_status: "pending",
      order_status: "pending_verification",
      payment_message: paymentMessage,
      payment_expires_at: paymentExpiresAt,
      public_token: publicToken,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      order: null,
      qrDataUrl: null,
      spd: null,
      publicToken: null,
      error: error?.message ?? "Failed to create order.",
    };
  }

  const order = mapOrder(data as OrderRow);
  await writeAudit({
    orderUuid: order.id,
    action: "created",
    meta: { orderId, totalCzk, quantity, denomination, paymentExpiresAt },
  });

  const { spd, qrDataUrl } = await buildPaymentQrDataUrl(config, totalCzk, orderId);

  void sendVoucherConfirmationEmail({
    order,
    config,
    qrDataUrl,
  });

  return { order, qrDataUrl, spd, publicToken, error: null };
}

export async function listVoucherOrders(limit = 200): Promise<VoucherOrder[]> {
  await expireOverdueVoucherOrders();
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("voucher_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  const orders = ((data as OrderRow[] | null) ?? []).map((row) => mapOrder(row));
  if (orders.length === 0) return orders;

  const { data: codes } = await admin
    .from("voucher_codes")
    .select("*")
    .in(
      "order_uuid",
      orders.map((o) => o.id),
    )
    .order("created_at", { ascending: true });

  const byOrder = new Map<string, VoucherCode[]>();
  for (const row of (codes as CodeRow[] | null) ?? []) {
    const list = byOrder.get(row.order_uuid) ?? [];
    list.push(mapCode(row));
    byOrder.set(row.order_uuid, list);
  }
  return orders.map((o) => ({ ...o, codes: byOrder.get(o.id) ?? [] }));
}

export async function getVoucherOrderById(idOrOrderId: string): Promise<VoucherOrder | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("voucher_orders")
    .select("*")
    .or(`id.eq.${idOrOrderId},order_id.eq.${idOrOrderId}`)
    .maybeSingle();
  if (!data) return null;
  const order = mapOrder(data as OrderRow);
  const { data: codes } = await admin
    .from("voucher_codes")
    .select("*")
    .eq("order_uuid", order.id)
    .order("created_at", { ascending: true });
  return { ...order, codes: ((codes as CodeRow[] | null) ?? []).map(mapCode) };
}

export async function verifyVoucherPayment(input: {
  orderUuid: string;
  staffId?: string | null;
  staffName?: string | null;
}): Promise<{ order: VoucherOrder | null; error: string | null }> {
  await expireOverdueVoucherOrders();
  const admin = createSupabaseAdmin();
  const { data: existing } = await admin
    .from("voucher_orders")
    .select("*")
    .eq("id", input.orderUuid)
    .maybeSingle();
  if (!existing) return { order: null, error: "Order not found." };
  const row = existing as OrderRow;

  // Idempotent: already issued → return current state (no duplicate codes).
  if (row.payment_status === "paid" && (row.order_status === "issued" || row.order_status === "fully_redeemed" || row.order_status === "partially_redeemed")) {
    const current = await getVoucherOrderById(row.id);
    return { order: current, error: null };
  }

  if (row.payment_status === "cancelled") {
    return { order: null, error: "Order is cancelled." };
  }

  const config = await fetchVoucherConfigServer();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt =
    config.validityDays > 0
      ? new Date(now.getTime() + config.validityDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  // Claim verification atomically to avoid double-click duplicates.
  const { data: claimed, error: claimError } = await admin
    .from("voucher_orders")
    .update({
      payment_status: "paid",
      order_status: "paid",
      verified_at: nowIso,
      verified_by_staff_id: input.staffId ?? null,
      verified_by_staff_name: input.staffName ?? "Staff",
      updated_at: nowIso,
    })
    .eq("id", row.id)
    .eq("payment_status", "pending")
    .select("*")
    .maybeSingle();

  if (claimError) return { order: null, error: claimError.message };

  let orderRow = (claimed as OrderRow | null) ?? row;
  if (!claimed) {
    // Another request already verified — check if codes exist.
    const current = await getVoucherOrderById(row.id);
    if (current?.codes && current.codes.length > 0) {
      return { order: current, error: null };
    }
    orderRow = row;
  }

  const { count } = await admin
    .from("voucher_codes")
    .select("id", { count: "exact", head: true })
    .eq("order_uuid", orderRow.id);

  if ((count ?? 0) === 0) {
    const codeRows = [];
    for (let i = 0; i < orderRow.quantity; i++) {
      codeRows.push({
        order_uuid: orderRow.id,
        code: createVoucherCode(),
        denomination_czk: orderRow.denomination_czk,
        status: "issued",
        expires_at: expiresAt,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
    const { error: codeError } = await admin.from("voucher_codes").insert(codeRows);
    if (codeError) return { order: null, error: codeError.message };
  }

  await admin
    .from("voucher_orders")
    .update({
      order_status: "issued",
      issued_at: nowIso,
      payment_status: "paid",
      updated_at: nowIso,
    })
    .eq("id", orderRow.id);

  await writeAudit({
    orderUuid: orderRow.id,
    action: "payment_verified",
    staffId: input.staffId,
    staffName: input.staffName,
  });
  await writeAudit({
    orderUuid: orderRow.id,
    action: "issued",
    staffId: input.staffId,
    staffName: input.staffName,
    meta: { quantity: orderRow.quantity },
  });

  const order = await getVoucherOrderById(orderRow.id);
  if (order?.codes?.length) {
    const qrPayloads: { code: string; qrDataUrl: string }[] = [];
    for (const code of order.codes) {
      const qrDataUrl = await QRCode.toDataURL(code.code, {
        type: "image/png",
        width: 360,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      qrPayloads.push({ code: code.code, qrDataUrl });
    }
    void sendVoucherIssuedEmail({ order, config, vouchers: qrPayloads });
  }

  return { order, error: null };
}

export async function lookupVoucherCode(
  rawCode: string,
): Promise<{ code: VoucherCode | null; order: VoucherOrder | null; error: string | null }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { code: null, order: null, error: "Empty code." };
  const admin = createSupabaseAdmin();
  const { data } = await admin.from("voucher_codes").select("*").eq("code", code).maybeSingle();
  if (!data) return { code: null, order: null, error: "Voucher not found." };
  const mapped = mapCode(data as CodeRow);
  // Expire lazily
  if (
    mapped.status === "issued" &&
    mapped.expiresAt &&
    new Date(mapped.expiresAt).getTime() < Date.now()
  ) {
    await admin
      .from("voucher_codes")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", mapped.id)
      .eq("status", "issued");
    mapped.status = "expired";
  }
  const order = await getVoucherOrderById(mapped.orderUuid);
  return { code: mapped, order, error: null };
}

export async function redeemVoucherCode(input: {
  code: string;
  staffId?: string | null;
  staffName?: string | null;
  tableLabel?: string | null;
}): Promise<{ code: VoucherCode | null; error: string | null }> {
  const found = await lookupVoucherCode(input.code);
  if (!found.code) return { code: null, error: found.error ?? "Voucher not found." };
  if (found.code.status === "redeemed") return { code: found.code, error: "Voucher already redeemed." };
  if (found.code.status === "cancelled") return { code: found.code, error: "Voucher is cancelled." };
  if (found.code.status === "expired") return { code: found.code, error: "Voucher has expired." };

  const now = new Date().toISOString();
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("voucher_codes")
    .update({
      status: "redeemed",
      redeemed_at: now,
      redeemed_by_staff_id: input.staffId ?? null,
      redeemed_by_staff_name: input.staffName ?? "Staff",
      redeemed_table_label: input.tableLabel ?? null,
      updated_at: now,
    })
    .eq("id", found.code.id)
    .eq("status", "issued")
    .select("*")
    .maybeSingle();

  if (error) return { code: null, error: error.message };
  if (!data) return { code: found.code, error: "Voucher could not be redeemed (already used)." };

  await writeAudit({
    orderUuid: found.code.orderUuid,
    voucherCodeId: found.code.id,
    action: "redeemed",
    staffId: input.staffId,
    staffName: input.staffName,
    meta: { code: found.code.code, tableLabel: input.tableLabel },
  });

  // Refresh order aggregate status
  const { data: siblings } = await admin
    .from("voucher_codes")
    .select("status")
    .eq("order_uuid", found.code.orderUuid);
  const statuses = ((siblings as { status: string }[] | null) ?? []).map((s) => s.status);
  const allRedeemed = statuses.length > 0 && statuses.every((s) => s === "redeemed" || s === "cancelled");
  const anyRedeemed = statuses.some((s) => s === "redeemed");
  await admin
    .from("voucher_orders")
    .update({
      order_status: allRedeemed ? "fully_redeemed" : anyRedeemed ? "partially_redeemed" : "issued",
      updated_at: now,
    })
    .eq("id", found.code.orderUuid);

  return { code: mapCode(data as CodeRow), error: null };
}

async function findOrderByPublicToken(
  orderId: string,
  token: string,
): Promise<OrderRow | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("voucher_orders")
    .select("*")
    .eq("order_id", orderId.trim())
    .eq("public_token", token.trim())
    .maybeSingle();
  return (data as OrderRow | null) ?? null;
}

export async function getGuestVoucherOrderStatus(input: {
  orderId: string;
  token: string;
}): Promise<{
  order: VoucherOrder | null;
  remainingSeconds: number;
  error: string | null;
}> {
  await expireOverdueVoucherOrders();
  const row = await findOrderByPublicToken(input.orderId, input.token);
  if (!row) return { order: null, remainingSeconds: 0, error: "Order not found." };
  const order = mapOrder(row);
  let remainingSeconds = 0;
  if (
    order.paymentStatus === "pending" &&
    !order.guestMarkedPaidAt &&
    order.paymentExpiresAt
  ) {
    remainingSeconds = Math.max(
      0,
      Math.ceil((new Date(order.paymentExpiresAt).getTime() - Date.now()) / 1000),
    );
  }
  return { order, remainingSeconds, error: null };
}

export async function markGuestVoucherPaid(input: {
  orderId: string;
  token: string;
}): Promise<{ order: VoucherOrder | null; error: string | null }> {
  await expireOverdueVoucherOrders();
  const row = await findOrderByPublicToken(input.orderId, input.token);
  if (!row) return { order: null, error: "Order not found." };

  if (row.payment_status === "cancelled") {
    return { order: mapOrder(row), error: "This order has expired and was cancelled." };
  }
  if (row.payment_status === "paid") {
    return { order: mapOrder(row), error: null };
  }
  if (row.guest_marked_paid_at) {
    return { order: mapOrder(row), error: null };
  }

  if (row.payment_expires_at && new Date(row.payment_expires_at).getTime() < Date.now()) {
    await expireOverdueVoucherOrders();
    const fresh = await findOrderByPublicToken(input.orderId, input.token);
    return {
      order: fresh ? mapOrder(fresh) : null,
      error: "Payment window expired. This order was cancelled.",
    };
  }

  const nowIso = new Date().toISOString();
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("voucher_orders")
    .update({
      guest_marked_paid_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", row.id)
    .eq("payment_status", "pending")
    .is("guest_marked_paid_at", null)
    .select("*")
    .maybeSingle();

  if (error) return { order: null, error: error.message };
  const updated = (data as OrderRow | null) ?? row;
  if (data) {
    await writeAudit({
      orderUuid: row.id,
      action: "guest_marked_paid",
    });
  }
  return { order: mapOrder(updated), error: null };
}

export { DEFAULT_VOUCHER_CONFIG };
