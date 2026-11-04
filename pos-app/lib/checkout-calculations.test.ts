import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCheckoutTotals, expandCheckoutLines, mergeCheckoutLines, ordersFromLines, remainingLines } from "./checkout-calculations";
import type { OrderItem } from "./types";

const hunan = { id: "hunan-row", name: "Hunan", quantity: 1, price: 180 } as OrderItem;

test("reopened quantity-one portions sharing a DB row are individually selectable", () => {
  const orders = [{ ...hunan }, { ...hunan }];
  const lines = expandCheckoutLines(orders);
  assert.equal(new Set(lines.map(line => line.lineId)).size, 2);
  const selectedLineIds = [lines[0].lineId];
  const totals = buildCheckoutTotals({ lines, allLines: lines, selectedLineIds,
    discountType: "percent", discountValue: 0, tip: 0, splitMode: "items", splitCount: 1 });
  assert.equal(totals.payableLines.length, 1);
  assert.equal(totals.amountDueNow, 180);
  const remaining = remainingLines(lines, selectedLineIds);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, hunan.id);
  assert.deepEqual(orders, [{ ...hunan }, { ...hunan }]);
});

test("saving unpaid portions restores DB row quantity without losing food", () => {
  const lines = expandCheckoutLines([{ ...hunan, quantity: 3 }]);
  const unpaid = ordersFromLines(remainingLines(lines, [lines[0].lineId]));
  const updates = mergeCheckoutLines(unpaid);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, hunan.id);
  assert.equal(updates[0].quantity, 2);
  const reopened = expandCheckoutLines(updates);
  assert.equal(reopened.length, 2);
  assert.equal(new Set(reopened.map(line => line.lineId)).size, 2);
});

test("distinct underlying DB rows remain distinct when quantities are saved", () => {
  const lines = expandCheckoutLines([{ ...hunan, quantity: 2, unitIds: ["a", "b"] }]);
  assert.deepEqual(lines.map(line => line.id), ["a", "b"]);
  assert.deepEqual(mergeCheckoutLines(lines).map(line => line.quantity), [1, 1]);
});
