import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { postStaffChatReply } from "@/src/lib/guest-chat-server";

export async function POST(request: Request) {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { sessionId?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = await postStaffChatReply({
    sessionId: body.sessionId?.trim() ?? "",
    body: body.body ?? "",
    staffId: staff?.staffId ?? null,
    staffName: staff?.staffName ?? staff?.username ?? null,
  });

  if (result.error || !result.message) {
    return NextResponse.json({ error: result.error ?? "Failed." }, { status: 400 });
  }

  return NextResponse.json({ message: result.message, session: result.session });
}
