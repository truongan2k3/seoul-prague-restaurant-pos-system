/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Node harness stubs auth/DB/Next boundaries and executes the actual TypeScript actions. */
const assert = require("node:assert/strict");
const { test, beforeEach, after } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
const root = path.resolve(__dirname, "../..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
const oldFlag = process.env.EET_CHECKOUT_ENABLED;
const oldSecret = process.env.EET_WORKER_SECRET;
const tableId = "30000000-0000-4000-a000-000000000001";
const businessId = "10000000-0000-4000-a000-000000000001";
const visit = "2026-11-10T19:00:00+00:00";
let state;

const db = {
  from(name) {
    let columns = "", options;
    const query = {
      insert: async () => ({ data: null, error: null }),
      select(value, settings) { columns = value; options = settings; return query; },
      eq() { return query; }, is() { return query; },
      maybeSingle: async () => ({ data: name === "sales" ? state.saved : { mode: "playground", submission_control: "automatic" }, error: null }),
      single: async () => ({ data: name === "tables" ? { ...state.table, eet_settlement_key: state.pendingKey }
        : name === "sales" ? state.saved : null, error: null }),
      then(resolve) {
        if (name === "order_items") return Promise.resolve({ data: state.lines, error: null }).then(resolve);
        if (options?.head) return Promise.resolve({ count: state.priorEqual, error: null }).then(resolve);
        throw new Error(`Unexpected fixture query ${name}:${columns}`);
      },
    };
    return query;
  },
  async rpc(name) {
    if (name === "eet_finish_settlement") { state.pendingKey = null; return { data: null, error: null }; }
    throw new Error(`Unexpected fixture RPC ${name}`);
  },
};
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, ...args);
};
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "next/server") return { after: callback => { state.background.push(callback); } };
  if (request === "./auth" && parent.filename.endsWith("eet/payment-actions.ts")) return { eetActor: async () => {
    if (!state.authorized) throw new Error("Authorized business and staff login required.");
    return { db, businessId, staff: { id: "staff", role: "server", name: "Staff" } };
  } };
  if (request === "./payment-service" && parent.filename.endsWith("eet/payment-actions.ts")) {
    const actual = originalLoad.call(this, request, parent, isMain);
    return { ...actual, commitValidatedEetSale: async (_context, sale, intent) => {
      state.commits++;
      state.saved = { ...sale, id: randomUUID(), eet_business_id: businessId, eet_visit_revision: intent.expectedRevision };
      state.pendingKey = intent.key; state.table.eet_payment_revision++;
      return { id: state.saved.id, replayed: false, skipSettlement: false };
    } };
  }
  if (request === "@/src/lib/referral-actions") return { commitReferralSaleAction: async () => { throw new Error("Referral fixture intentionally not enabled."); } };
  if (request === "@/src/lib/table-actions") return { settleConfirmedCheckout: async () => {
    state.settlements++; if (state.settlementFails) return { data: null, error: new Error("fixture outage") };
    return { data: { id: tableId }, error: null };
  } };
  if ((request === "./worker" && parent.filename.endsWith("eet/payment-actions.ts")) || request === "@/src/lib/eet/worker") return { runEetWorker: async () => ({ processed: 0, state: "idle" }) };
  return originalLoad.call(this, request, parent, isMain);
};
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const { commitEetCheckoutAction, getEetCheckoutContextAction, recoverEetSettlementAction } = require("../../src/lib/eet/payment-actions.ts");
const { GET } = require("../../app/api/eet/worker/route.ts");
const { GET: health } = require("../../app/api/eet/health/route.ts");
const sale = overrides => ({ table_id: tableId, table_label: "A2", seated_at: visit, subtotal: 200, discount_amount: 20, tip: 10, grand_total: 190,
  payment_method: "cash", split_mode: "total", split_count: 1, voucher_discount_amount: 0,
  items: [{ id: "dish", quantity: 1, price: 200 }], ...overrides });
const intent = () => ({ key: randomUUID(), expectedVisit: visit, expectedRevision: 0 });
beforeEach(() => {
  process.env.EET_CHECKOUT_ENABLED = "true";
  state = { authorized: true, commits: 0, settlements: 0, pendingKey: null, saved: null, priorEqual: 0, background: [], settlementFails: false,
    table: { label: "A2", occupied_at: visit, status: "waiting", payment_status: "unpaid", eet_payment_revision: 0 },
    lines: [{ id: "dish", name: "BBQ", price: 200, quantity: 1, status: "served", kitchen_status: "served" }] };
});
after(() => {
  if (oldFlag === undefined) delete process.env.EET_CHECKOUT_ENABLED; else process.env.EET_CHECKOUT_ENABLED = oldFlag;
  if (oldSecret === undefined) delete process.env.EET_WORKER_SECRET; else process.env.EET_WORKER_SECRET = oldSecret;
  Module._load = originalLoad; Module._resolveFilename = originalResolve;
});

test("disabled integration delegates to legacy checkout without requiring DB authorization", async () => {
  process.env.EET_CHECKOUT_ENABLED = "false"; state.authorized = false;
  assert.deepEqual(await commitEetCheckoutAction({}, undefined, undefined, {}), { handled: false });
  assert.equal((await getEetCheckoutContextAction(tableId)).context.enabled, false);
});
test("confirmed cash/card call the existing settlement once and schedule reporting after capture", async () => {
  const result = await commitEetCheckoutAction(sale({ payment_method: "card" }), undefined, intent(), { closeTable: true });
  assert.equal(result.handled, true); assert.equal(result.error, null);
  assert.equal(state.commits, 1); assert.equal(state.settlements, 1); assert.equal(state.background.length, 1);
});
test("unauthorized staff cannot capture a payment", async () => {
  state.authorized = false;
  const result = await commitEetCheckoutAction(sale(), undefined, intent(), { closeTable: true });
  assert.match(result.error, /Authorized/); assert.equal(state.commits, 0);
});
test("empty/changed orders, stale visits and insufficient cash fail before payment capture", async () => {
  assert.match((await commitEetCheckoutAction(sale({ items: [] }), undefined, intent(), {})).error, /empty/);
  assert.match((await commitEetCheckoutAction(sale({ items: [{ id: "dish", quantity: 1, price: 1 }] }), undefined, intent(), {})).error, /Order changed/);
  assert.match((await commitEetCheckoutAction(sale(), undefined, { ...intent(), expectedVisit: "yesterday" }, {})).error, /changed/);
  assert.match((await commitEetCheckoutAction(sale({ amount_given: 100 }), undefined, intent(), {})).error, /Insufficient/);
  assert.equal(state.commits, 0);
});
test("double-submit replay cannot create or settle a second payment", async () => {
  const request = sale(), key = intent(), options = { closeTable: true };
  await commitEetCheckoutAction(request, undefined, key, options);
  await commitEetCheckoutAction(request, undefined, key, options);
  assert.equal(state.commits, 1); assert.equal(state.settlements, 1);
});
test("a persisted payment can recover settlement after a response/error without charging again", async () => {
  state.settlementFails = true;
  const result = await commitEetCheckoutAction(sale(), undefined, intent(), { closeTable: true });
  assert.match(result.error, /Payment is recorded/); assert.equal(state.commits, 1); assert.ok(state.pendingKey);
  state.settlementFails = false; await recoverEetSettlementAction(tableId);
  assert.equal(state.commits, 1); assert.equal(state.pendingKey, null);
});
test("equal-split components are not divided again and cannot exceed split count", async () => {
  const share = sale({ subtotal: 100, discount_amount: 0, tip: 0, grand_total: 100, split_mode: "equal", split_count: 2, items: [{ id: "dish", quantity: 1, price: 100 }] });
  assert.equal((await commitEetCheckoutAction(share, undefined, intent(), { closeTable: false })).error, null);
  assert.equal(state.saved.grand_total, 100);
  state.saved = null; state.table.eet_payment_revision = 0; state.priorEqual = 2;
  assert.match((await commitEetCheckoutAction(share, undefined, intent(), { closeTable: false })).error, /progress changed/);
});
test("item-split cannot discard unpaid quantities or close their table", async () => {
  state.lines[0].quantity = 2;
  const partial = sale({ split_mode: "items" });
  assert.match((await commitEetCheckoutAction(partial, undefined, intent(), { closeTable: true, remainingOrders: [] })).error, /preserved/);
  assert.equal(state.commits, 0);
  assert.equal((await commitEetCheckoutAction(partial, undefined, intent(), { closeTable: false, remainingOrders: [{ id: "dish", quantity: 1, price: 200 }] })).error, null);
});
test("protected worker rejects missing/wrong credentials and accepts only the configured secret", async () => {
  process.env.EET_WORKER_SECRET = "a".repeat(40);
  assert.equal((await GET(new Request("https://local.test/api/eet/worker"))).status, 401);
  assert.equal((await GET(new Request("https://local.test/api/eet/worker", { headers: { authorization: "Bearer wrong" } }))).status, 401);
  assert.equal((await GET(new Request("https://local.test/api/eet/worker", { headers: { authorization: `Bearer ${"a".repeat(40)}` } }))).status, 200);
  assert.equal((await health(new Request("https://local.test/api/eet/health"))).status, 401);
});
