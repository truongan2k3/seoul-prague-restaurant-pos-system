import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { listVoucherOrders } from "@/src/lib/voucher-server";

export async function GET() {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orders = await listVoucherOrders();
  return NextResponse.json({ orders });
}
