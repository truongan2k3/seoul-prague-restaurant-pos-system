import { NextResponse } from "next/server";
import {
  buildPaymentQrDataUrl,
  fetchVoucherConfigServer,
} from "@/src/lib/voucher-server";
import { createVoucherOrderId } from "@/lib/voucher";

/** Preview Czech payment QR for a given total (before place order). */
export async function GET(request: Request) {
  const amount = Number(new URL(request.url).searchParams.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
  }
  const config = await fetchVoucherConfigServer();
  if (!config.enabled) {
    return NextResponse.json({ error: "Disabled." }, { status: 400 });
  }
  // Preview uses a temporary id so QR amount is correct; final order regenerates with real id.
  const previewId = createVoucherOrderId();
  const { spd, qrDataUrl } = await buildPaymentQrDataUrl(config, Math.round(amount), previewId);
  return NextResponse.json({
    spd,
    qrDataUrl,
    previewOrderId: previewId,
    hasIban: Boolean(config.iban?.trim()),
  });
}
