import { NextResponse } from "next/server";
import type { GuestChatPage } from "@/lib/guest-chat";
import { openOrResumeGuestChatSession } from "@/src/lib/guest-chat-server";

export async function POST(request: Request) {
  let body: { guestClientId?: string; page?: GuestChatPage; sessionId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const guestClientId = body.guestClientId?.trim();
  if (!guestClientId) {
    return NextResponse.json({ error: "Missing guestClientId." }, { status: 400 });
  }

  const page: GuestChatPage =
    body.page === "reservation" || body.page === "other" ? body.page : "landing";

  const result = await openOrResumeGuestChatSession({
    guestClientId,
    page,
    sessionId: body.sessionId,
  });

  if (result.error || !result.session) {
    return NextResponse.json({ error: result.error ?? "Failed." }, { status: 400 });
  }

  return NextResponse.json({
    session: result.session,
    messages: result.messages,
    config: result.config,
  });
}
