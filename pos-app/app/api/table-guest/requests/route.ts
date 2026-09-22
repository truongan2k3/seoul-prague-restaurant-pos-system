import { NextResponse } from "next/server";
import { listPendingTableGuestRequests } from "@/src/lib/table-guest-server";

/** Staff inbox — pending guest QR requests. */
export async function GET() {
  try {
    const requests = await listPendingTableGuestRequests();
    return NextResponse.json({ requests });
  } catch (error) {
    console.error("[table-guest] list pending failed", error);
    return NextResponse.json({ error: "Failed to load requests." }, { status: 500 });
  }
}
