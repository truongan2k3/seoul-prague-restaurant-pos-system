import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { countStaffUnreadGuestChats } from "@/src/lib/guest-chat-server";

export async function GET() {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await countStaffUnreadGuestChats();
  return NextResponse.json({ count });
}
