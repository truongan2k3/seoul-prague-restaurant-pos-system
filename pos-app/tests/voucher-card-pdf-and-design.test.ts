import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_VOUCHER_DESIGN,
  parseVoucherConfig,
  voucherConfigToDb,
  type VoucherConfig,
} from "../lib/voucher";
import { renderVoucherOrderAssets } from "../src/lib/voucher-card-render";
import { sendVoucherIssuedEmail } from "../src/lib/voucher-email";

test("parseVoucherConfig sanitizes and preserves VoucherCardDesign", () => {
  const legacy = parseVoucherConfig({ enabled: true, validityDays: 180 });
  assert.equal(legacy.design?.frontTitle, DEFAULT_VOUCHER_DESIGN.frontTitle);
  assert.equal(legacy.design?.accentColor, "#C9A88B");

  const custom = parseVoucherConfig({
    design: {
      frontTitle: "DÁRKOVÝ POUKAZ",
      frontBrandLine: "INTOWN · PRAHA",
      accentColor: "#D4AF37",
      surfaceColor: "invalid-hex",
      frontOverlayOpacity: 150,
      venueAddress: "Václavské náměstí 1, Praha",
      termsLines: ["Line 1", "", "Line 2"],
    },
  });
  assert.equal(custom.design?.frontTitle, "DÁRKOVÝ POUKAZ");
  assert.equal(custom.design?.accentColor, "#D4AF37");
  assert.equal(custom.design?.surfaceColor, DEFAULT_VOUCHER_DESIGN.surfaceColor);
  assert.equal(custom.design?.frontOverlayOpacity, 90);
  assert.deepEqual(custom.design?.termsLines, ["Line 1", "Line 2"]);

  const roundTrip = parseVoucherConfig(voucherConfigToDb(custom));
  assert.equal(roundTrip.design?.venueAddress, "Václavské náměstí 1, Praha");
});

test("renderVoucherOrderAssets renders 2-sided PNGs and valid 2-page PDF readable by pdfjs-dist", async () => {
  const config: VoucherConfig = parseVoucherConfig({
    validityDays: 365,
    design: {
      frontTitle: "GIFT VOUCHER",
      frontBrandLine: "SEOUL PRAGUE · PRAHA",
      frontSubtitle: "Korean BBQ Experience",
      venueAddress: "Prague 1, Czechia",
      venuePhone: "+420 777 888 999",
      venueEmail: "hello@example.com",
      venueWebsite: "seoulprague.com",
      termsLines: [
        "Valid for 12 months from issue.",
        "Present QR code at the counter before paying.",
      ],
    },
  });

  const result = await renderVoucherOrderAssets({
    order: {
      id: "ord-1",
      orderId: "SPV-20261126-TEST",
      buyerName: "Lukas Horak",
      buyerEmail: "lukas@example.com",
      denominationCzk: 5000,
      quantity: 1,
      totalCzk: 5000,
      paymentMethod: "czech_qr",
      paymentStatus: "paid",
      orderStatus: "issued",
      createdAt: "2026-11-26T10:00:00.000Z",
      updatedAt: "2026-11-26T10:05:00.000Z",
    },
    codes: [
      {
        id: "code-1",
        orderUuid: "ord-1",
        code: "SPV-TESTCARD01",
        denominationCzk: 5000,
        status: "issued",
        expiresAt: "2027-11-26T10:05:00.000Z",
        createdAt: "2026-11-26T10:05:00.000Z",
      },
    ],
    config,
  });

  assert.equal(result.vouchers.length, 1);
  assert.ok(result.vouchers[0]!.frontPng.length > 5000, "Front PNG should be non-trivial");
  assert.ok(result.vouchers[0]!.backPng.length > 5000, "Back PNG should be non-trivial");
  assert.equal(result.pdfBuffer.subarray(0, 5).toString("ascii"), "%PDF-");

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(result.pdfBuffer) }).promise;
  assert.equal(doc.numPages, 2);

  const page1 = await doc.getPage(1);
  const vp1 = page1.getViewport({ scale: 1 });
  assert.equal(Math.round(vp1.width), 595);
  assert.equal(Math.round(vp1.height), 377);
  await doc.cleanup();
});

test("sendVoucherIssuedEmail attaches 2-sided PDF, inline front PNG, and online link", async () => {
  const prevKey = process.env.RESEND_API_KEY;
  const prevFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;

  process.env.RESEND_API_KEY = "test-key";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ id: "email-pdf-1" }), { status: 200 });
  }) as typeof fetch;

  try {
    const config = parseVoucherConfig({});
    const assets = await renderVoucherOrderAssets({
      order: {
        id: "ord-2",
        orderId: "SPV-20261126-MAIL",
        buyerName: "Petr Svoboda",
        buyerEmail: "petr@example.com",
        denominationCzk: 2000,
        quantity: 1,
        totalCzk: 2000,
        paymentMethod: "bank_transfer",
        paymentStatus: "paid",
        orderStatus: "issued",
        createdAt: "2026-11-26T10:00:00.000Z",
        updatedAt: "2026-11-26T10:05:00.000Z",
      },
      codes: [
        {
          id: "code-2",
          orderUuid: "ord-2",
          code: "SPV-MAILCARD02",
          denominationCzk: 2000,
          status: "issued",
          expiresAt: "2027-11-26T10:05:00.000Z",
          createdAt: "2026-11-26T10:05:00.000Z",
        },
      ],
      config,
    });

    const sent = await sendVoucherIssuedEmail({
      order: {
        id: "ord-2",
        orderId: "SPV-20261126-MAIL",
        buyerName: "Petr Svoboda",
        buyerEmail: "petr@example.com",
        denominationCzk: 2000,
        quantity: 1,
        totalCzk: 2000,
        paymentMethod: "bank_transfer",
        paymentStatus: "paid",
        orderStatus: "issued",
        createdAt: "2026-11-26T10:00:00.000Z",
        updatedAt: "2026-11-26T10:05:00.000Z",
      },
      config,
      vouchers: assets.vouchers,
      pdfBuffer: assets.pdfBuffer,
      viewUrl: "https://example.com/voucher/view?token=abc123",
    });

    assert.equal(sent.sent, true);
    assert.ok(capturedBody);
    const body = capturedBody as { html: string; attachments: Array<{ filename: string; content_type?: string }> };
    assert.match(body.html, /https:\/\/example\.com\/voucher\/view\?token=abc123/);
    assert.match(body.html, /cid:voucher-front-1/);
    assert.match(body.html, /cid:voucher-back-1/);
    assert.ok(body.attachments.some((a) => a.content_type === "application/pdf" && a.filename.endsWith(".pdf")));
    assert.ok(body.attachments.some((a) => a.content_type === "image/png" && a.filename.includes("front")));
    assert.ok(body.attachments.some((a) => a.content_type === "image/png" && a.filename.includes("back")));
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
  }
});
