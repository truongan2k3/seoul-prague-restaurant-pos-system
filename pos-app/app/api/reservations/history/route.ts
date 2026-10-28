import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

export async function GET(request: Request) {
  const [auth, staff] = await Promise.all([readAuthSession(), readStaffSession()]);
  if ((!auth && !staff) || (auth && staff && auth.businessId !== staff.businessId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("reservationId") ?? "";
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) {
    return NextResponse.json({ error: "Invalid reservation." }, { status: 400 });
  }
  try {
    const { data, error } = await createSupabaseAdmin().from("reservation_guest_changes")
      .select("id,changed_at,changes").eq("reservation_id", id)
      .order("changed_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 50);
    if (error) return NextResponse.json({ error: "Reservation history unavailable.",
      setupRequired: ["42P01", "PGRST205"].includes(error.code) }, { status: 503 });
    return NextResponse.json({ events: (data ?? []).slice(0, 50), hasMore: (data?.length ?? 0) > 50 },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Reservation history unavailable." }, { status: 503 });
  }
}
