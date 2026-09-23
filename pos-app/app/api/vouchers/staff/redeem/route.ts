import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { lookupVoucherCode, redeemVoucherCode } from "@/src/lib/voucher-server";

export async function GET(request: Request) {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  const result = await lookupVoucherCode(code);
  if (result.error || !result.code) {
    return NextResponse.json({ error: result.error ?? "Not found." }, { status: 404 });
  }
  return NextResponse.json({ code: result.code, order: result.order });
}

export async function POST(request: Request) {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { code?: string; tableLabel?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = await redeemVoucherCode({
    code: body.code ?? "",
    staffId: staff?.staffId ?? null,
    staffName: staff?.staffName ?? "Staff",
    tableLabel: body.tableLabel,
  });

  if (result.error || !result.code) {
    return NextResponse.json({ error: result.error ?? "Failed." }, { status: 400 });
  }
  return NextResponse.json({ code: result.code });
}
