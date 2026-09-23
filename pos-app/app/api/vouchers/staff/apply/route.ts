import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import {
  applyVoucherToTable,
  listAppliedVouchersForTable,
  releaseVoucherFromTable,
} from "@/src/lib/voucher-server";

async function requireStaff() {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), staff: null };
  }
  return { error: null, staff };
}

export async function GET(request: Request) {
  const gate = await requireStaff();
  if (gate.error) return gate.error;
  const tableId = new URL(request.url).searchParams.get("tableId")?.trim() ?? "";
  if (!tableId) {
    return NextResponse.json({ error: "Missing tableId." }, { status: 400 });
  }
  const codes = await listAppliedVouchersForTable(tableId);
  return NextResponse.json({ codes });
}

export async function POST(request: Request) {
  const gate = await requireStaff();
  if (gate.error) return gate.error;

  let body: {
    action?: "apply" | "release";
    code?: string;
    tableId?: string;
    tableLabel?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const code = body.code?.trim() ?? "";
  const tableId = body.tableId?.trim() ?? "";
  if (!code || !tableId) {
    return NextResponse.json({ error: "Missing code or tableId." }, { status: 400 });
  }

  if (body.action === "release") {
    const result = await releaseVoucherFromTable({
      code,
      tableId,
      staffId: gate.staff?.staffId ?? null,
      staffName: gate.staff?.staffName ?? "Staff",
    });
    if (result.error) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
    }
    return NextResponse.json({ code: result.code });
  }

  const result = await applyVoucherToTable({
    code,
    tableId,
    tableLabel: body.tableLabel,
    staffId: gate.staff?.staffId ?? null,
    staffName: gate.staff?.staffName ?? "Staff",
  });
  if (result.error) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
  }
  return NextResponse.json({ code: result.code });
}
