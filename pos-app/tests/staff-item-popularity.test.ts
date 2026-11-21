import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isRestrictedLunchCategory,
  normalizeCategoryKey,
  isLunchRestrictionActive,
} from "../lib/staff-item-popularity";

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
