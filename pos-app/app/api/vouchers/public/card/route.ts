import { NextResponse } from "next/server";
import {
  renderVoucherBackPng,
  renderVoucherFrontPng,
} from "@/src/lib/voucher-card-render";
import { getGuestVoucherViewByToken } from "@/src/lib/voucher-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = params.get("token")?.trim() ?? "";
  const codeParam = params.get("code")?.trim().toUpperCase() ?? "";
  const side = params.get("side") === "back" ? "back" : "front";
  const download = params.get("download") === "1";

  const view = await getGuestVoucherViewByToken(token);
  if (view.error || !view.order || !view.design) {
    return NextResponse.json({ error: view.error ?? "Not found" }, { status: 404 });
  }
  if (view.order.paymentStatus !== "paid" || view.order.orderStatus === "cancelled") {
    return NextResponse.json({ error: "Voucher is not issued." }, { status: 403 });
  }

  const targetCode =
    (codeParam ? view.codes.find((c) => c.code.toUpperCase() === codeParam) : view.codes[0]) ??
    null;
  if (!targetCode) {
    return NextResponse.json({ error: "Voucher code not found." }, { status: 404 });
  }

  const renderInput = {
    code: targetCode.code,
    denominationCzk: targetCode.denominationCzk || view.order.denominationCzk,
    expiresAt: targetCode.expiresAt ?? null,
    validityDays: view.config.validityDays,
    design: view.design,
  };

  const png =
    side === "back"
      ? await renderVoucherBackPng(renderInput)
      : await renderVoucherFrontPng(renderInput);

  const headers: Record<string, string> = {
    "Content-Type": "image/png",
    "Cache-Control": "no-store",
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="voucher-${targetCode.code}-${side}.png"`;
  }

  return new Response(new Uint8Array(png), { status: 200, headers });
}
