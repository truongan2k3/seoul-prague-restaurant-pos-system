import { NextResponse } from "next/server";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { sendPosPush } from "@/src/lib/push-server";

/** Deliberately target only this signed-in staff member's saved device. */
export async function POST(request: Request) {
  const staff = await readStaffSession();
  if (!staff?.staffId) return NextResponse.json({ error: "Sign in to POS first." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("endpoint" in body) || typeof body.endpoint !== "string" || body.endpoint.length > 4096) {
    return NextResponse.json({ error: "Invalid device subscription." }, { status: 400 });
  }
  const result = await sendPosPush({
    kind: "test",
    title: "SEOUL PRAGUE — Push test",
    body: "This device can receive POS push notifications.",
    tag: "pos-device-push-test",
  }, { endpoint: body.endpoint, staffId: staff.staffId });
  if (result.error) {
    return NextResponse.json({ error: result.error === "not_configured"
      ? "Server push keys are missing or invalid. Check the Vercel VAPID configuration."
      : "Push subscription storage is unavailable. Check the server database configuration." }, { status: 503 });
  }
  if (!result.sent) return NextResponse.json({ error: result.failed
    ? "The push service rejected this device. Enable notifications again and retry."
    : "No saved push subscription for this device. Enable notifications and retry." }, { status: 409 });
  return NextResponse.json({ ok: true, accepted: result.sent });
}
