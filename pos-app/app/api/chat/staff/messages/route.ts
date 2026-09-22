import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { listMessagesForSession } from "@/src/lib/guest-chat-server";

export async function GET(request: Request) {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }

  const messages = await listMessagesForSession(sessionId);
  return NextResponse.json({ messages });
}
