import { NextResponse } from "next/server";
import { parseVoucherConfig, type VoucherConfig } from "@/lib/voucher";
import { canManageStaff, normalizeStaffRole } from "@/lib/staff-roles";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import {
  fetchVoucherConfigServer,
  saveVoucherConfigServer,
} from "@/src/lib/voucher-server";

async function requireAdmin() {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (staff && !canManageStaff(normalizeStaffRole(staff.staffRole))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { error: null };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const config = await fetchVoucherConfigServer();
  return NextResponse.json({ config });
}

export async function PUT(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: { config?: Partial<VoucherConfig> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const next = parseVoucherConfig({
    ...(await fetchVoucherConfigServer()),
    ...(body.config ?? {}),
  });
  const { error } = await saveVoucherConfigServer(next);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ config: next });
}
