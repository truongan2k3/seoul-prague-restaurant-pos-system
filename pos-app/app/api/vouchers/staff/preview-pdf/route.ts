import { NextResponse } from "next/server";
import { canManageStaff, normalizeStaffRole } from "@/lib/staff-roles";
import { parseVoucherConfig, type VoucherConfig } from "@/lib/voucher";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { renderVoucherOrderAssets } from "@/src/lib/voucher-card-render";
import { fetchVoucherConfigServer, resolveEffectiveVoucherDesign } from "@/src/lib/voucher-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (staff && !canManageStaff(normalizeStaffRole(staff.staffRole))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { config?: Partial<VoucherConfig>; denominationCzk?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const baseConfig = await fetchVoucherConfigServer();
  const config = parseVoucherConfig({ ...baseConfig, ...(body.config ?? {}) });
  const design = await resolveEffectiveVoucherDesign(config);

  const amount =
    Number(body.denominationCzk) > 0
      ? Math.round(Number(body.denominationCzk))
      : config.denominationsCzk[0] ?? 5000;

  const nowIso = new Date().toISOString();
  const expiresAt =
    config.validityDays > 0
      ? new Date(Date.now() + config.validityDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const { pdfBuffer } = await renderVoucherOrderAssets({
    order: {
      id: "preview-order",
      orderId: "SPV-PREVIEW",
      buyerName: "Sample Guest",
      buyerEmail: "guest@example.com",
      denominationCzk: amount,
      quantity: 1,
      totalCzk: amount,
      paymentMethod: "czech_qr",
      paymentStatus: "paid",
      orderStatus: "issued",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    codes: [
      {
        id: "preview-code",
        orderUuid: "preview-order",
        code: "SPV-PREVIEW2026",
        denominationCzk: amount,
        status: "issued",
        expiresAt,
        createdAt: nowIso,
      },
    ],
    config,
    designOverride: design,
  });

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="Voucher-Sample-Preview.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
