import test from "node:test";
import assert from "node:assert/strict";
import { sendVoucherConfirmationEmail, sendVoucherIssuedEmail } from "../src/lib/voucher-email";
import type { VoucherConfig, VoucherOrder } from "../lib/voucher";

const baseConfig: VoucherConfig = {
  enabled: true,
  denominationsCzk: [500, 1000, 2000],
  accountHolder: "Seoul Prague s.r.o.",
  accountNumber: "123456789/0100",
  iban: "CZ6508000000192000145399",
  bankName: "Komerční banka",
  bicSwift: "KOMBCZPPXXX",
  validityDays: 365,
  bankPaymentNote: "",
  processingMessage:
    "Thank you for ordering a voucher. We will process your order within 24 hours.",
  confirmationEmailSubject: "Voucher order received",
  issuedEmailSubject: "Your Gift Voucher",
};

const sampleOrder: VoucherOrder = {
  id: "uuid-1",
  orderId: "VO-20261126-001",
  buyerName: "Anna Novak",
  buyerEmail: "anna@example.com",
  buyerPhone: "+420123456789",
  denominationCzk: 1000,
  quantity: 1,
  totalCzk: 1000,
  paymentMethod: "bank_transfer",
  paymentStatus: "paid",
  orderStatus: "issued",
  createdAt: "2026-11-26T10:00:00.000Z",
  updatedAt: "2026-11-26T10:05:00.000Z",
};

const sampleQrDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("sendVoucherIssuedEmail (reissue) keeps exact code, formats friendly email, and avoids brand spam", async () => {
  const prevKey = process.env.RESEND_API_KEY;
  const prevFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;

  process.env.RESEND_API_KEY = "test-key";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await sendVoucherIssuedEmail({
      order: sampleOrder,
      config: baseConfig,
      vouchers: [
        {
          code: "SPV-KEEP-9999",
          qrDataUrl: sampleQrDataUrl,
          expiresAt: "2027-11-26T10:05:00.000Z",
        },
      ],
      isReissue: true,
    });

    assert.equal(result.sent, true);
    assert.ok(capturedBody);
    const body = capturedBody as Record<string, unknown>;
    const html = String(body.html);
    const text = String(body.text);
    const subject = String(body.subject);

    assert.match(subject, /Resent/);
    assert.match(html, /SPV-KEEP-9999/);
    assert.match(text, /SPV-KEEP-9999/);
    assert.match(html, /Hi Anna Novak,/);
    assert.match(html, /original voucher code remains unchanged/i);
    assert.match(html, /26 Nov 2027/);

    const brandMatches = html.match(/seoul prague/gi) ?? [];
    assert.ok(
      brandMatches.length <= 1,
      `Expected at most 1 brand mention in HTML, got ${brandMatches.length}`,
    );
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
  }
});

test("sendVoucherConfirmationEmail avoids brand spam and keeps order details", async () => {
  const prevKey = process.env.RESEND_API_KEY;
  const prevFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;

  process.env.RESEND_API_KEY = "test-key";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ id: "email-2" }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await sendVoucherConfirmationEmail({
      order: sampleOrder,
      config: baseConfig,
      qrDataUrl: sampleQrDataUrl,
    });

    assert.equal(result.sent, true);
    assert.ok(capturedBody);
    const body = capturedBody as Record<string, unknown>;
    const html = String(body.html);

    assert.match(html, /VO-20261126-001/);
    assert.match(html, /Hi Anna Novak,/);
    assert.match(html, /15 minutes/);

    const brandMatches = html.match(/seoul prague/gi) ?? [];
    assert.ok(
      brandMatches.length <= 2,
      `Expected minimal brand mentions (<=2 including accountHolder), got ${brandMatches.length}`,
    );
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
  }
});
