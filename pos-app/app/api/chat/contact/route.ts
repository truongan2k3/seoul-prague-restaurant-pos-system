import { NextResponse } from "next/server";
import { markFollowUpOffered, submitGuestChatFollowUp } from "@/src/lib/guest-chat-server";

export async function POST(request: Request) {
  let body: {
    guestClientId?: string;
    sessionId?: string;
    email?: string;
    phone?: string;
    name?: string;
    offeredOnly?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim() ?? "";
  const guestClientId = body.guestClientId?.trim() ?? "";
  if (!sessionId || !guestClientId) {
    return NextResponse.json({ error: "Missing session." }, { status: 400 });
  }

  if (body.offeredOnly) {
    await markFollowUpOffered(sessionId);
    return NextResponse.json({ ok: true });
  }

  const result = await submitGuestChatFollowUp({
    guestClientId,
    sessionId,
    email: body.email ?? "",
    phone: body.phone,
    name: body.name,
  });

  if (result.error || !result.session) {
    return NextResponse.json({ error: result.error ?? "Failed." }, { status: 400 });
  }

  return NextResponse.json({ session: result.session });
}
