import test from "node:test";
import assert from "node:assert/strict";
import { selectTopLongestSeatedTables } from "../components/table-availability-summary";
import { sendReservationEmail } from "../src/lib/reservation-email";
import { silentPrintEscPosPerPrinter } from "../src/lib/print-bridge-client";
import { guestReservationCopy } from "../lib/i18n/guest-reservation";
import { guestVoucherCopy } from "../lib/i18n/guest-voucher";
import type { LiveTableAvailability } from "../lib/table-availability";

function makeTable(label: string, occupiedAt: string | null): LiveTableAvailability {
  return {
    id: label,
    label,
    capacity: 4,
    grill: true,
    occupied: occupiedAt !== null,
    blocked: false,
    status: occupiedAt !== null ? "occupied" : "available",
    estimatedReleaseAt: null,
    earliestSeatingAt: null,
    nextReservationAt: null,
    availableNow: occupiedAt === null,
    availableUntil: null,
    occupiedAt,
    upcomingReservations: [],
    overEstimatedTime: false,
  };
}

test("selectTopLongestSeatedTables hides section when fewer than 3 occupied tables", () => {
  const now = new Date("2026-11-27T18:00:00Z").getTime();
  const res = selectTopLongestSeatedTables(
    [
      makeTable("A1", "2026-11-27T17:00:00Z"),
      makeTable("A2", "2026-11-27T17:30:00Z"),
      makeTable("A3", null),
    ],
    { reservations: [] },
    now,
  );
  assert.deepEqual(res, []);
});

test("selectTopLongestSeatedTables returns Top 3 longest seated when >= 3 occupied", () => {
  const now = new Date("2026-11-27T18:00:00Z").getTime();
  const res = selectTopLongestSeatedTables(
    [
      makeTable("A1", "2026-11-27T17:10:00Z"), // 50m
      makeTable("A2", "2026-11-27T16:15:00Z"), // 105m (longest)
      makeTable("B1", "2026-11-27T17:45:00Z"), // 15m
      makeTable("C1", "2026-11-27T16:40:00Z"), // 80m (2nd)
      makeTable("D1", "2026-11-27T16:55:00Z"), // 65m (3rd)
    ],
    { reservations: [] },
    now,
  );
  assert.deepEqual(
    res.map((r) => r.label),
    ["A2", "C1", "D1"],
  );
});

test("sendReservationEmail uses modern design and Seoul Korean BBQ Prague without brand spam", async () => {
  const prevKey = process.env.RESEND_API_KEY;
  const prevFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;

  process.env.RESEND_API_KEY = "test-key";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ id: "res-1" }), { status: 200 });
  }) as typeof fetch;

  try {
    const out = await sendReservationEmail("confirmed", {
      guestName: "Jan Novak",
      guestEmail: "jan@example.com",
      partySize: 4,
      reservedAt: new Date("2026-11-28T18:00:00Z"),
      bookingCode: "RES-9988",
      manageUrl: "https://seoulprague.com/reservation/manage?token=xyz",
    });
    assert.equal(out.sent, true);
    assert.ok(capturedBody);
    const body = capturedBody as { html: string; from: string; subject: string };
    assert.match(body.from, /^Seoul Korean BBQ Prague </);
    assert.match(body.html, /RES-9988/);
    assert.match(body.html, /Hi Jan Novak,/);
    const brandHits = body.html.match(/Seoul Korean BBQ Prague/gi) ?? [];
    assert.equal(brandHits.length, 1, "Brand name should appear cleanly once in HTML");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
  }
});

test("silentPrintEscPosPerPrinter prints working printer even when another printer fails and reports exact failed printer", async () => {
  const prevFetch = globalThis.fetch;
  const printedHosts: string[] = [];

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { host: string };
    if (body.host === "192.168.1.201") {
      return new Response(
        JSON.stringify({ ok: false, error: "Timeout connecting to 192.168.1.201:9100" }),
        { status: 500 },
      );
    }
    printedHosts.push(body.host);
    return new Response(JSON.stringify({ ok: true, bytes: 10 }), { status: 200 });
  }) as typeof fetch;

  try {
    const res = await silentPrintEscPosPerPrinter(
      {
        silentPrintEnabled: true,
        printBridgeUrl: "http://127.0.0.1:39100",
        browserPrintFallback: false,
        printers: [
          { id: "p1", name: "Kitchen Old IP", host: "192.168.1.201", port: "9100", enabled: true, roles: ["kitchen"] },
          { id: "p2", name: "Kitchen Backup", host: "192.168.1.202", port: "9100", enabled: true, roles: ["kitchen"] },
        ],
      },
      "kitchen",
      () => new Uint8Array([0x1b, 0x40]),
    );

    assert.equal(res.sent, true);
    assert.deepEqual(printedHosts, ["192.168.1.202"]);
    assert.deepEqual(res.succeededPrinterIds, ["p2"]);
    assert.equal(res.failedPrinters.length, 1);
    assert.equal(res.failedPrinters[0]?.id, "p1");
    assert.match(res.error ?? "", /Kitchen Old IP \(192\.168\.1\.201\)/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("guest voucher & reservation copy include flip hints and staff-confirm email notice", () => {
  const voucherVi = guestVoucherCopy("vi");
  const voucherEn = guestVoucherCopy("en");
  assert.ok(voucherEn.previewTapBadge.length > 0);
  assert.ok(voucherEn.previewHintFront.length > 0);
  assert.ok(voucherEn.previewHintBack.length > 0);
  assert.match(voucherVi.previewFlipAction, /lật|mặt/i);

  const resVi = guestReservationCopy("vi");
  const resEn = guestReservationCopy("en");
  assert.match(resEn.emailAfterConfirmNote, /confirm.*as soon as possible/i);
  assert.match(resEn.spamFolderReminder, /Spam/i);
  assert.match(resVi.emailAfterConfirmNote, /xác nhận.*sớm nhất/i);
  assert.match(resVi.spamFolderReminder, /Spam/i);
});
