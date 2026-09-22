import { NextResponse } from "next/server";
import { listMessagesForSession, postGuestChatMessage } from "@/src/lib/guest-chat-server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId")?.trim();
  const guestClientId = searchParams.get("guestClientId")?.trim();
  if (!sessionId || !guestClientId) {
    return NextResponse.json({ error: "Missing sessionId or guestClientId." }, { status: 400 });
  }

  // Ownership check happens via guestClientId on post; for GET we still require both.
  const messages = await listMessagesForSession(sessionId);
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  let body: { guestClientId?: string; sessionId?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = await postGuestChatMessage({
    guestClientId: body.guestClientId?.trim() ?? "",
    sessionId: body.sessionId?.trim() ?? "",
    body: body.body ?? "",
  });

  if (result.error || !result.message) {
    return NextResponse.json({ error: result.error ?? "Failed." }, { status: 400 });
  }

  return NextResponse.json({ message: result.message, session: result.session });
}
