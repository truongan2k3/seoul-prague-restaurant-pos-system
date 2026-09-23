import { NextResponse } from "next/server";
import { markGuestVoucherPaid } from "@/src/lib/voucher-server";

export async function POST(request: Request) {
  let body: { orderId?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const orderId = body.orderId?.trim() ?? "";
  const token = body.token?.trim() ?? "";
  if (!orderId || !token) {
    return NextResponse.json({ error: "Missing orderId or token." }, { status: 400 });
  }

  const result = await markGuestVoucherPaid({ orderId, token });
  if (result.error && !result.order) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  if (result.error && result.order?.paymentStatus === "cancelled") {
    return NextResponse.json(
      {
        error: result.error,
        order: {
          orderId: result.order.orderId,
          paymentStatus: result.order.paymentStatus,
          orderStatus: result.order.orderStatus,
          guestMarkedPaidAt: result.order.guestMarkedPaidAt,
          paymentExpiresAt: result.order.paymentExpiresAt,
        },
      },
      { status: 410 },
    );
  }

  return NextResponse.json({
    order: result.order
      ? {
          orderId: result.order.orderId,
          paymentStatus: result.order.paymentStatus,
          orderStatus: result.order.orderStatus,
          guestMarkedPaidAt: result.order.guestMarkedPaidAt,
          paymentExpiresAt: result.order.paymentExpiresAt,
        }
      : null,
    error: result.error,
  });
}
