import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { recoverCancelledVoucherOrder, verifyVoucherPayment } from "@/src/lib/voucher-server";

export async function POST(request: Request) {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { orderUuid?: string; recoverCancelled?: boolean; paymentReceived?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const orderUuid = typeof body.orderUuid === "string" ? body.orderUuid.trim() : "";
  if (!orderUuid) {
    return NextResponse.json({ error: "Missing order." }, { status: 400 });
  }

  if (body.recoverCancelled === true && (!staff || body.paymentReceived !== true)) {
    return NextResponse.json({ error: "A logged-in staff member must confirm the bank transfer was received." }, { status: 403 });
  }
  const result = body.recoverCancelled === true && staff ? await recoverCancelledVoucherOrder({
    orderUuid, staffId: staff.staffId, staffName: staff.staffName, businessId: staff.businessId,
  }) : await verifyVoucherPayment({
    orderUuid,
    staffId: staff?.staffId ?? null,
    staffName: staff?.staffName ?? "Staff",
  });

  if (result.error || !result.order) {
    return NextResponse.json({ error: result.error ?? "Failed." }, { status: 400 });
  }

  return NextResponse.json({ order: result.order });
}
