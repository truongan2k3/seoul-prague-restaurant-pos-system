import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isRestrictedLunchCategory,
  normalizeCategoryKey,
  isLunchRestrictionActive,
  recordStaffOrderItems,
  getStaffItemClickCounts,
  mergeStaffItemClickCounts,
  seedStaffItemClickCounts,
  sortTopMenuItems,
  aggregateItemSentCounts,
  mergeSentCounts,
  getCombinedItemSentCounts,
} from "../lib/staff-item-popularity";
import type { MenuItem } from "../lib/types";

test("normalizeCategoryKey handles diacritics and formatting", () => {
  assert.equal(normalizeCategoryKey("Polévka"), "polevka");
  assert.equal(normalizeCategoryKey("Hlavní jídlo"), "hlavni jidlo");
  assert.equal(normalizeCategoryKey("Vietnamská"), "vietnamska");
  assert.equal(normalizeCategoryKey("Nudle a rýže"), "nudle a ryze");
  assert.equal(normalizeCategoryKey("Kachna/Kuřecí kousky"), "kachna/kureci kousky");
  assert.equal(normalizeCategoryKey("Kachna / Kuřecí kousky"), "kachna/kureci kousky");
  assert.equal(normalizeCategoryKey("Polévky & vývary"), "polevky & vyvary");
});

test("isRestrictedLunchCategory matches only the 5 lunch categories", () => {
  // Should match
  assert.equal(isRestrictedLunchCategory("Polévka"), true);
  assert.equal(isRestrictedLunchCategory("polevka"), true);
  assert.equal(isRestrictedLunchCategory("Hlavní jídlo"), true);
  assert.equal(isRestrictedLunchCategory("hlavni jidlo"), true);
  assert.equal(isRestrictedLunchCategory("Vietnamská"), true);
  assert.equal(isRestrictedLunchCategory("vietnamska"), true);
  assert.equal(isRestrictedLunchCategory("Nudle a rýže"), true);
  assert.equal(isRestrictedLunchCategory("nudle a ryze"), true);
  assert.equal(isRestrictedLunchCategory("Kachna/Kuřecí kousky"), true);
  assert.equal(isRestrictedLunchCategory("kachna/kureci kousky"), true);

  // Should NOT match
  assert.equal(isRestrictedLunchCategory("Extra"), false);
  assert.equal(isRestrictedLunchCategory("Sushi"), false);
  assert.equal(isRestrictedLunchCategory("Polévky & vývary"), false);
  assert.equal(isRestrictedLunchCategory("Prémiové hovězí"), false);
  assert.equal(isRestrictedLunchCategory("Vepřové/Kuřecí"), false);
});

test("isLunchRestrictionActive evaluates Prague time window 16:00 to 01:00 and weekends", () => {
  // Prague is UTC+1 in winter (November).
  // Monday 12:00 Prague = Monday 11:00 UTC
  const monLunch = new Date("2026-11-16T11:00:00Z");
  assert.equal(isLunchRestrictionActive(monLunch), false);

  // Monday 15:59 Prague = Monday 14:59 UTC
  const monBefore16 = new Date("2026-11-16T14:59:00Z");
  assert.equal(isLunchRestrictionActive(monBefore16), false);

  // Monday 16:00 Prague = Monday 15:00 UTC
  const mon16 = new Date("2026-11-16T15:00:00Z");
  assert.equal(isLunchRestrictionActive(mon16), true);

  // Monday 20:30 Prague = Monday 19:30 UTC
  const monEvening = new Date("2026-11-16T19:30:00Z");
  assert.equal(isLunchRestrictionActive(monEvening), true);

  // Tuesday 00:30 Prague = Monday 23:30 UTC (before 01:00)
  const tueMidnight = new Date("2026-11-16T23:30:00Z");
  assert.equal(isLunchRestrictionActive(tueMidnight), true);

  // Tuesday 01:05 Prague = Tuesday 00:05 UTC (after 01:00)
  const tueAfter1 = new Date("2026-11-17T00:05:00Z");
  assert.equal(isLunchRestrictionActive(tueAfter1), false);

  // Saturday 12:00 Prague = Saturday 11:00 UTC (weekend all day)
  const satLunch = new Date("2026-11-21T11:00:00Z");
  assert.equal(isLunchRestrictionActive(satLunch), true);

  // Sunday 14:00 Prague = Sunday 13:00 UTC (weekend all day)
  const sunAfternoon = new Date("2026-11-22T13:00:00Z");
  assert.equal(isLunchRestrictionActive(sunAfternoon), true);
});

test("recordStaffOrderItems increments item counts by order quantity", () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, val),
  };
  (globalThis as any).window = { localStorage: mockStorage };

  recordStaffOrderItems([
    { menuItemId: "item-banchan", quantity: 2 },
    { menuItemId: "item-birell", quantity: 1 },
  ]);

  const counts = getStaffItemClickCounts();
  assert.equal(counts["item-banchan"], 2);
  assert.equal(counts["item-birell"], 1);

  // Send another order with 1 more banchan
  recordStaffOrderItems([
    { menuItemId: "item-banchan", quantity: 1 },
  ]);

  const updated = getStaffItemClickCounts();
  assert.equal(updated["item-banchan"], 3);
  assert.equal(updated["item-birell"], 1);
});

test("mergeStaffItemClickCounts merges remote counts keeping highest values", () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, val),
  };
  (globalThis as any).window = { localStorage: mockStorage };

  recordStaffOrderItems([{ menuItemId: "item-a", quantity: 2 }]);
  mergeStaffItemClickCounts({ "item-a": 5, "item-b": 3 });

  const counts = getStaffItemClickCounts();
  assert.equal(counts["item-a"], 5);
  assert.equal(counts["item-b"], 3);

  // Lower count shouldn't decrease
  mergeStaffItemClickCounts({ "item-a": 1 });
  assert.equal(getStaffItemClickCounts()["item-a"], 5);
});

test("seedStaffItemClickCounts populates counts from active orders", () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, val),
  };
  (globalThis as any).window = { localStorage: mockStorage };

  seedStaffItemClickCounts([
    { menuItemId: "item-pork", quantity: 3 },
    { menuItemId: "item-kimchi", quantity: 1 },
  ]);

  const counts = getStaffItemClickCounts();
  assert.equal(counts["item-pork"], 3);
  assert.equal(counts["item-kimchi"], 1);
});

test("sortTopMenuItems prioritizes popularity then category then sortOrder", () => {
  const categories = [
    { id: "cat-appetizers", name: "Khai vị" },
    { id: "cat-bbq", name: "Món nướng BBQ" },
    { id: "cat-drinks", name: "Đồ uống" },
  ];

  const items: MenuItem[] = [
    { id: "item-drink-2", nameEn: "Soju", nameCz: "Soju", nameZh: "烧酒", categoryId: "cat-drinks", category: "cat-drinks", price: 200, isAvailable: true, station: "bar", itemType: "drink", sortOrder: 1 },
    { id: "item-bbq-wagyu", nameEn: "Wagyu", nameCz: "Wagyu", nameZh: "和牛", categoryId: "cat-bbq", category: "cat-bbq", price: 600, isAvailable: true, station: "kitchen", itemType: "food", sortOrder: 0 },
    { id: "item-app-kimchi", nameEn: "Kimchi", nameCz: "Kimchi", nameZh: "泡菜", categoryId: "cat-appetizers", category: "cat-appetizers", price: 80, isAvailable: true, station: "kitchen", itemType: "food", sortOrder: 0 },
    { id: "item-drink-1", nameEn: "Beer", nameCz: "Pivo", nameZh: "啤酒", categoryId: "cat-drinks", category: "cat-drinks", price: 70, isAvailable: true, station: "bar", itemType: "drink", sortOrder: 0 },
  ];

  // Case 1: item-drink-2 has highest popularity (10), item-bbq-wagyu has 5, others have 0
  const popularity = {
    "item-drink-2": 10,
    "item-bbq-wagyu": 5,
  };

  const sorted = sortTopMenuItems(items, popularity, categories);

  // 1st: Soju (10 clicks)
  assert.equal(sorted[0].id, "item-drink-2");
  // 2nd: Wagyu (5 clicks)
  assert.equal(sorted[1].id, "item-bbq-wagyu");
  // 3rd: Kimchi (0 clicks, but cat-appetizers is 1st category)
  assert.equal(sorted[2].id, "item-app-kimchi");
  // 4th: Beer (0 clicks, cat-drinks is 3rd category)
  assert.equal(sorted[3].id, "item-drink-1");
});

test("aggregateItemSentCounts sums quantities across tables and matches names", () => {
  const menuItems: MenuItem[] = [
    { id: "item-wagyu", nameEn: "Wagyu Beef", nameCz: "Wagyu", nameZh: "和牛", category: "bbq", price: 600, isAvailable: true, station: "kitchen", itemType: "food", sortOrder: 0 },
    { id: "item-beer", nameEn: "Pilsner Beer", nameCz: "Pivo", nameZh: "啤酒", category: "drinks", price: 70, isAvailable: true, station: "bar", itemType: "drink", sortOrder: 0 },
  ];

  const orders = [
    { menuItemId: "item-wagyu", quantity: 2 },
    { menuItemId: "item-beer", quantity: 3 },
    { menuItemId: "item-wagyu", quantity: 4 }, // second table ordered wagyu
    { name: "Pilsner Beer", quantity: 2 }, // matched by name
    { menuItemId: "item-wagyu", quantity: 5, isCancelled: true }, // cancelled -> ignored
  ];

  const counts = aggregateItemSentCounts(orders, menuItems);
  assert.equal(counts["item-wagyu"], 6); // 2 + 4 = 6
  assert.equal(counts["item-beer"], 5); // 3 + 2 = 5
});

test("getCombinedItemSentCounts aggregates sales, active orders, and session sends", () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, val),
  };
  (globalThis as any).window = { localStorage: mockStorage };

  // 1. Completed sales bills
  const salesCounts = {
    "item-wagyu": 20,
    "item-beer": 15,
  };

  // 2. Active tables right now
  const activeOrders = [
    { menuItemId: "item-beer", quantity: 10 },
    { menuItemId: "item-kimchi", quantity: 5 },
  ];

  const combined = getCombinedItemSentCounts(activeOrders, undefined, salesCounts);

  // Wagyu: 20 (sales) + 0 (active) = 20
  assert.equal(combined["item-wagyu"], 20);
  // Beer: 15 (sales) + 10 (active) = 25 -> Beer becomes #1!
  assert.equal(combined["item-beer"], 25);
  // Kimchi: 0 (sales) + 5 (active) = 5
  assert.equal(combined["item-kimchi"], 5);
});
