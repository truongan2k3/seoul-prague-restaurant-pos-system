import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { buildTableGuestUrl, isTableQrEligible } from "@/lib/table-guest";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

type Params = { params: Promise<{ tableId: string }> };

/** Download a PNG QR for a fixed table guest URL. */
export async function GET(request: Request, { params }: Params) {
  const { tableId } = await params;
  if (!tableId?.trim()) {
    return NextResponse.json({ error: "Missing table id." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("tables")
    .select("id, label")
    .eq("id", tableId.trim())
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Table not found." }, { status: 404 });
  }

  const table = data as { id: string; label: string };
  if (!isTableQrEligible(table)) {
    return NextResponse.json({ error: "Takeaway / S tables do not get QR codes." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const guestUrl = buildTableGuestUrl(table.id, origin);
  const png = await QRCode.toBuffer(guestUrl, {
    type: "png",
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0B0B0C", light: "#FFFFFF" },
  });

  const safeLabel = table.label.replace(/[^a-zA-Z0-9_-]+/g, "_") || "table";
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="table-${safeLabel}-qr.png"`,
      "Cache-Control": "no-store",
    },
  });
}
