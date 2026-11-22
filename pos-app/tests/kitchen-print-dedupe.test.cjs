/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

// Mock window and localStorage
const storage = new Map();
global.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
  },
};

const fileContent = fs.readFileSync("lib/kitchen-print-dedupe.ts", "utf8");
const transpiled = ts.transpileModule(fileContent, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});

const moduleExports = {};
const fn = new Function("exports", "require", transpiled.outputText);
fn(moduleExports, require);

const {
  claimKitchenPrintItemId,
  hasKitchenPrintItemIdBeenClaimed,
  filterAndClaimUnprintedOrders,
  claimKitchenPrintMessage,
  registerPrintStationTab,
} = moduleExports;

(async () => {
  // Test 1: Item ID claiming
  assert.equal(claimKitchenPrintItemId("item-1"), true, "First claim should succeed");
  assert.equal(claimKitchenPrintItemId("item-1"), false, "Second claim of same item must fail (prevents double print)");
  assert.equal(hasKitchenPrintItemIdBeenClaimed("item-1"), true);
  assert.equal(hasKitchenPrintItemIdBeenClaimed("item-2"), false);

  // Test 2: Filter and claim unprinted orders
  const orders = [
    { id: "item-1", name: "Pho Bo" }, // already claimed above
    { id: "item-2", name: "Bun Cha" }, // not yet claimed
  ];
  const unprinted = filterAndClaimUnprintedOrders(orders);
  assert.equal(unprinted.length, 1, "Only unprinted items should pass");
  assert.equal(unprinted[0].id, "item-2");
  assert.equal(claimKitchenPrintItemId("item-2"), false, "item-2 was claimed during filter");

  // Test 3: Message deduplication
  assert.equal(claimKitchenPrintMessage("msg-job-1"), true);
  assert.equal(claimKitchenPrintMessage("msg-job-1"), false, "Second claim of same message must fail");

  // Test 4: Tab leader election
  const tabA = registerPrintStationTab("tab-A");
  assert.equal(tabA.isLeader(), true, "Tab A should become leader");

  const tabB = registerPrintStationTab("tab-B");
  assert.equal(tabB.isLeader(), false, "Tab B must stay in standby while Tab A is active");

  // Tab A resigns (e.g. window closed)
  tabA.resign();
  assert.equal(tabB.isLeader(), true, "Tab B takes over as leader after Tab A resigns");

  console.log("PASS: kitchen-print-dedupe prevents double printing across items, batches, messages, and tabs.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
