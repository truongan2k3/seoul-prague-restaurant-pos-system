import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { reissueVoucherEmail } from "@/src/lib/voucher-server";

export async function POST(request: Request) {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { orderUuid?: string; recipientEmail?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const orderUuid = typeof body.orderUuid === "string" ? body.orderUuid.trim() : "";
  if (!orderUuid) {
    return NextResponse.json({ error: "Missing order." }, { status: 400 });
  }

  const recipientEmail =
    typeof body.recipientEmail === "string" ? body.recipientEmail.trim() : undefined;

  const result = await reissueVoucherEmail({
    orderUuid,
    recipientEmail,
    staffId: staff?.staffId ?? null,
    staffName: staff?.staffName ?? "Staff",
  });

  if (!result.sent || result.error || !result.order) {
    return NextResponse.json(
      { error: result.error ?? "Failed to reissue voucher email." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    sentTo: result.sentTo,
    order: result.order,
  });
}
