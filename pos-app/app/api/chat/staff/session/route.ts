import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { updateStaffChatSession } from "@/src/lib/guest-chat-server";

export async function PATCH(request: Request) {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { sessionId?: string; action?: "mark_read" | "resolve" | "close" | "reopen" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = body.action;
  if (!body.sessionId?.trim() || !action) {
    return NextResponse.json({ error: "Missing sessionId or action." }, { status: 400 });
  }

  const result = await updateStaffChatSession({
    sessionId: body.sessionId.trim(),
    action,
  });

  if (result.error || !result.session) {
    return NextResponse.json({ error: result.error ?? "Failed." }, { status: 400 });
  }

  return NextResponse.json({ session: result.session });
}
