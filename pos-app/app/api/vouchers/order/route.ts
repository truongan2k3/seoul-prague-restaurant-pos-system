import { NextResponse } from "next/server";
import type { VoucherPaymentMethod } from "@/lib/voucher";
import { createVoucherOrder } from "@/src/lib/voucher-server";

export async function POST(request: Request) {
  let body: {
    buyerName?: string;
    buyerEmail?: string;
    denominationCzk?: number;
    quantity?: number;
    paymentMethod?: VoucherPaymentMethod;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = await createVoucherOrder({
    buyerName: body.buyerName ?? "",
    buyerEmail: body.buyerEmail ?? "",
    denominationCzk: Number(body.denominationCzk),
    quantity: Number(body.quantity),
    paymentMethod: body.paymentMethod === "czech_qr" ? "czech_qr" : "bank_transfer",
  });

  if (result.error || !result.order) {
    return NextResponse.json({ error: result.error ?? "Failed." }, { status: 400 });
  }

  return NextResponse.json({
    order: result.order,
    qrDataUrl: result.qrDataUrl,
    spd: result.spd,
  });
}
