import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { expireOverdueVoucherOrders } from "@/src/lib/voucher-server";

/** Count pending voucher orders created after `since` (ISO). Used for unread badge. */
export async function GET(request: Request) {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await expireOverdueVoucherOrders();
  const since = new URL(request.url).searchParams.get("since")?.trim();
  const admin = createSupabaseAdmin();
  let query = admin
    .from("voucher_orders")
    .select("id", { count: "exact", head: true })
    .eq("payment_status", "pending")
    .neq("order_status", "cancelled");

  if (since) {
    query = query.gt("created_at", since);
  }

  const { count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message, count: 0 }, { status: 500 });
  }
  return NextResponse.json({ count: count ?? 0 });
}
