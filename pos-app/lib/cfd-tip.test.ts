import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCfdTipChoices, canApplyCfdTip, cfdTipAmount, isCfdTipRequest, type CfdTipOffer } from "@/lib/cfd-tip";
import type { CheckoutLine } from "@/lib/checkout-calculations";

const lines = [{ lineId: "a", id: "a", name: "Dinner", price: 1000, quantity: 1 }] as CheckoutLine[];
const bill = { lines, discountType: "percent" as const, discountValue: 10, splitMode: "total" as const, splitCount: 1 };
const offer: CfdTipOffer = {
  sessionId: "visit-a", revision: "bill-1", base: 900,
  choices: buildCfdTipChoices(bill, 0).choices,
  percent: null, enabled: true, selectionVersion: 0,
};
const request = { sessionId: "visit-a", revision: "bill-1", percent: 10, requestId: "request-1" };

test("discount is applied once; vouchers reduce payment once, never the tip base", () => {
  const result = buildCfdTipChoices(bill, 200);
  assert.equal(result.base, 900);
  assert.deepEqual(result.choices.find((choice) => choice.percent === 10), { percent: 10, tip: 90, total: 790 });
  assert.deepEqual(result.choices.find((choice) => choice.percent === 0), { percent: 0, tip: 0, total: 700 });
});

test("each percentage replaces the previous tip and No Tip removes it", () => {
  const choices = buildCfdTipChoices({ ...bill, discountValue: 0 }, 0).choices;
  assert.deepEqual([5, 20, 10, 0].map((percent) => choices.find((c) => c.percent === percent)?.total), [1050, 1200, 1100, 1000]);
});

test("over-value vouchers cannot pay tips or create negative totals", () => {
  const choices = buildCfdTipChoices(bill, 2000).choices;
  assert.equal(choices.find((c) => c.percent === 10)?.total, 90);
  assert.equal(choices.find((c) => c.percent === 0)?.total, 0);
});

test("equal split bill and person scope calculate only this guest's tip", () => {
  for (const equalAdjustScope of ["bill", "person"] as const) {
    const result = buildCfdTipChoices({ ...bill, splitMode: "equal", splitCount: 2, equalAdjustScope }, 100);
    assert.equal(result.base, 450);
    assert.deepEqual(result.choices.find((c) => c.percent === 10), { percent: 10, tip: 45, total: 395 });
  }
});

test("item splits exclude other guests' items", () => {
  const allLines = [...lines, { ...lines[0], lineId: "b", price: 500 }];
  const result = buildCfdTipChoices({ ...bill, lines: allLines, allLines, selectedLineIds: ["b"], splitMode: "items", discountValue: 0 }, 0);
  assert.equal(result.base, 500);
  assert.equal(result.choices.find((c) => c.percent === 20)?.total, 600);
});

test("rounding follows checkout rules, including fractional splits", () => {
  const result = buildCfdTipChoices({ ...bill, splitMode: "equal", splitCount: 3, equalAdjustScope: "bill", discountValue: 0, enablePriceRounding: true }, 0);
  assert.deepEqual(result.choices.find((c) => c.percent === 5), { percent: 5, tip: 16.67, total: 350 });
  assert.equal(cfdTipAmount(333.33, 15), 50);
});

test("changed bill, cancelled checkout, another order, and in-flight payments reject stale taps", () => {
  assert.equal(canApplyCfdTip(offer, request), true);
  assert.equal(canApplyCfdTip({ ...offer, revision: "bill-2" }, request), false);
  assert.equal(canApplyCfdTip({ ...offer, sessionId: "visit-b" }, request), false);
  assert.equal(canApplyCfdTip({ ...offer, enabled: false }, request), false);
});

test("invalid or arbitrary tip commands cannot enter checkout", () => {
  for (const value of [null, {}, { ...request, percent: -5 }, { ...request, percent: 100 }, { ...request, percent: "10" }, { ...request, requestId: "" }]) {
    assert.equal(isCfdTipRequest(value), false);
  }
});
