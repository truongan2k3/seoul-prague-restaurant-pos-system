import { NextResponse } from "next/server";
import type { GuestChatPage } from "@/lib/guest-chat";
import {
  openOrResumeGuestChatSession,
  type GuestChatSessionAction,
} from "@/src/lib/guest-chat-server";

export async function POST(request: Request) {
  let body: {
    guestClientId?: string;
    page?: GuestChatPage;
    sessionId?: string | null;
    guestName?: string | null;
    action?: GuestChatSessionAction;
  };
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
    body.page === "reservation" || body.page === "voucher" || body.page === "other"
      ? body.page
      : "landing";

  const action: GuestChatSessionAction =
    body.action === "start" || body.action === "need_help" ? body.action : "resume";

  const result = await openOrResumeGuestChatSession({
    guestClientId,
    page,
    sessionId: body.sessionId,
    guestName: body.guestName,
    action,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    session: result.session,
    messages: result.messages,
    config: result.config,
  });
}
