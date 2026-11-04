/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness loads actual receipt modules through the TypeScript compiler. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const ts = require('typescript');
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) {
  return resolve.call(this, id.startsWith('@/') ? path.join(root, id.slice(2)) : id, ...args);
};
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, file) => mod._compile(compile(file), file);
const { buildReceiptData, buildReceiptLines, receiptGuestLines } = require('../lib/receipt-calculations.ts');
const { ReceiptBodyContent } = require('../src/components/ReceiptPrint.tsx');
const { buildReceiptEscPosLines } = require('../src/lib/printReceipt.ts');
const dish = { name: 'Hunan', quantity: 1, price: 1000, taxGroup: 'B' };
const payment = { paymentMethod: 'card', subtotal: 1000, discountType: 'percent', discountValue: 0, discountAmount: 100, tip: 0, grandTotal: 900, amountDueNow: 900, splitMode: 'total', splitCount: 1 };
const bill = extra => buildReceiptData({ tableLabel: 'A1', orders: [dish], menuItems: [], payment, ...extra });

test('customer receipts hide BBQ sauces and banchan while preserving totals, VAT and kitchen lines', () => {
  const orders = [dish, { name: 'BBQ Sauces · 4', quantity: 1, price: 0 }, { name: 'Banchan', quantity: 1, price: 100 }];
  const before = JSON.stringify(orders);
  const data = bill({ orders, payment: { ...payment, subtotal: 1100, discountAmount: 110, grandTotal: 990 } });
  assert.deepEqual(data.items.map(item => item.name), ['Hunan']);
  assert.equal(data.subtotal, 1100); assert.equal(data.grandTotal, 990);
  assert.ok(Math.abs(data.taxGroups.reduce((sum, group) => sum + group.gross, 0) - 990) < 0.001);
  assert.equal(data.partySize, 4);
  assert.equal(buildReceiptLines(orders, new Map()).length, 3);
  assert.equal(JSON.stringify(orders), before);
  assert.doesNotMatch(buildReceiptEscPosLines(data).join('\n'), /BBQ Sauces|Banchan/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(ReceiptBodyContent, { data })), /BBQ Sauces|Banchan/);
});

test('guest name, actual party size and email appear on HTML and text receipts', () => {
  const data = bill({ guest: { guestName: 'Anna <Nováková>', partySize: 4, guestEmail: 'anna@example.com' } });
  const text = buildReceiptEscPosLines(data).join('\n');
  const html = renderToStaticMarkup(createElement(ReceiptBodyContent, { data }));
  for (const value of ['Počet osob: 4', 'anna@example.com']) { assert.ok(text.includes(value)); assert.ok(html.includes(value)); }
  assert.ok(text.includes('Anna <Nováková>')); assert.ok(html.includes('Anna &lt;Nováková&gt;'));
  assert.deepEqual(receiptGuestLines({}), []);
  assert.doesNotMatch(buildReceiptEscPosLines(bill({})).join('\n'), /Zákazník:|E-mail:|Počet osob:/);
});

test('referral-only discounts use the actual rate and code when manual discount is zero', () => {
  const data = bill({ payment: { ...payment, referral: { code: 'ANAN10', discountPercent: 10, discountAmount: 100 } } });
  assert.equal(data.discountLabel, 'Sleva ANAN10 (10%):');
  assert.equal(data.discountPercent, 10);
  assert.ok(buildReceiptEscPosLines(data).join('\n').includes('Sleva ANAN10 (10%):'));
});

test('combined discounts show the effective rate and fixed discounts do not claim 0%', () => {
  const combined = bill({ payment: { ...payment, discountValue: 10, discountAmount: 190, referral: { code: 'VIE10', discountPercent: 10, discountAmount: 100 } } });
  assert.equal(combined.discountLabel, 'Sleva VIE10 (19%):');
  assert.equal(bill({ payment: { ...payment, discountType: 'fixed', discountValue: 100 } }).discountLabel, 'Sleva:');
  assert.equal(bill({}).discountLabel, 'Sleva (10%):');
});

test('provisional, history and equal-share receipts retain the code and correct percentage', () => {
  for (const provisional of [false, true]) {
    const data = bill({ provisional, referralCode: 'VIE10', referralPercent: 10, payment: { ...payment, subtotal: 500, discountAmount: 50, grandTotal: 450 }, orders: [{ ...dish, price: 500 }] });
    assert.equal(data.discountLabel, 'Sleva VIE10 (10%):'); assert.equal(data.grandTotal, 450);
  }
});

test('receipt guest lookup uses actual attendance and can retrieve email for a historical reservation', async () => {
  const out = {}; let lookedUp;
  const row = { guest_name: ' Anna ', guest_email: ' anna@example.com ', party_size: 3, actual_party_size: 4 };
  const query = { select() { return this; }, eq(_key, id) { lookedUp = id; return this; }, async maybeSingle() { return { data: row }; } };
  vm.runInNewContext(compile(path.join(root, 'src/lib/receipt-guest.ts')), {
    exports: out,
    require: id => id.includes('reservation-actions') ? { findActiveReservationForTable: async () => ({ data: row }) } : { supabase: { from: () => query } },
  });
  const current = await out.fetchReceiptGuest({ tableId: 'table-a' });
  assert.equal(current.guestName, 'Anna'); assert.equal(current.partySize, 4); assert.equal(current.guestEmail, 'anna@example.com');
  await out.fetchReceiptGuest({ reservationId: 'past-reservation' }); assert.equal(lookedUp, 'past-reservation');
  assert.equal(Object.keys(await out.fetchReceiptGuest({})).length, 0);
});
