import { NextResponse } from "next/server";
import { getGuestVoucherOrderStatus } from "@/src/lib/voucher-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId")?.trim() ?? "";
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!orderId || !token) {
    return NextResponse.json({ error: "Missing orderId or token." }, { status: 400 });
  }

  const result = await getGuestVoucherOrderStatus({ orderId, token });
  if (result.error || !result.order) {
    return NextResponse.json({ error: result.error ?? "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    order: {
      orderId: result.order.orderId,
      paymentStatus: result.order.paymentStatus,
      orderStatus: result.order.orderStatus,
      paymentExpiresAt: result.order.paymentExpiresAt,
      guestMarkedPaidAt: result.order.guestMarkedPaidAt,
      totalCzk: result.order.totalCzk,
      paymentMessage: result.order.paymentMessage,
    },
    remainingSeconds: result.remainingSeconds,
  });
}
