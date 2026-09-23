import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { redeemAppliedVouchersForTable } from "@/src/lib/voucher-server";

export async function POST(request: Request) {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tableId?: string; tableLabel?: string; saleId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const tableId = body.tableId?.trim() ?? "";
  if (!tableId) {
    return NextResponse.json({ error: "Missing tableId." }, { status: 400 });
  }

  const result = await redeemAppliedVouchersForTable({
    tableId,
    tableLabel: body.tableLabel,
    saleId: body.saleId,
    staffId: staff?.staffId ?? null,
    staffName: staff?.staffName ?? "Staff",
  });

  return NextResponse.json({ redeemed: result.redeemed, error: result.error });
}
