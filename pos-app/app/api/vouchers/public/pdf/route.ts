import { NextResponse } from "next/server";
import { renderVoucherOrderAssets } from "@/src/lib/voucher-card-render";
import { getGuestVoucherViewByToken } from "@/src/lib/voucher-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = params.get("token")?.trim() ?? "";
  const codeParam = params.get("code")?.trim().toUpperCase() ?? "";

  const view = await getGuestVoucherViewByToken(token);
  if (view.error || !view.order || !view.design) {
    return NextResponse.json({ error: view.error ?? "Not found" }, { status: 404 });
  }
  if (view.order.paymentStatus !== "paid" || view.order.orderStatus === "cancelled") {
    return NextResponse.json({ error: "Voucher is not issued." }, { status: 403 });
  }

  const selectedCodes = codeParam
    ? view.codes.filter((c) => c.code.toUpperCase() === codeParam)
    : view.codes.filter((c) => c.status !== "cancelled");

  if (selectedCodes.length === 0) {
    return NextResponse.json({ error: "No voucher codes found." }, { status: 404 });
  }

  const { pdfBuffer } = await renderVoucherOrderAssets({
    order: view.order,
    codes: selectedCodes,
    config: view.config,
    designOverride: view.design,
  });

  const fileSlug =
    selectedCodes.length === 1 ? selectedCodes[0]!.code : view.order.orderId;

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Gift-Voucher-${fileSlug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
