import test from "node:test";
import assert from "node:assert/strict";
import { readServerScreenLayoutMode } from "../lib/server-screen";
import type { OrderItem } from "../lib/types";

// Test isActiveFloorItem logic
function isActiveFloorItem(item: OrderItem): boolean {
  if (item.modifiers?.paid || item.modifiers?.billSettled) return false;
  return item.kitchenStatus !== "archived";
}

// Test isBillableOrderItem logic
function isBillableOrderItem(
  item: Pick<OrderItem, "kitchenStatus" | "status" | "isCancelled" | "modifiers">,
): boolean {
  if (item.modifiers?.paid || item.modifiers?.billSettled) return false;
  const kitchenStatus = item.kitchenStatus;
  return kitchenStatus !== "cancelled" && kitchenStatus !== "archived" && !item.isCancelled;
}

test("KDS layout mode is locked to cards", () => {
  assert.equal(readServerScreenLayoutMode(), "cards");
});

test("isBillableOrderItem excludes items settled during split bill", () => {
  const unpaidItem: OrderItem = {
    id: "dish-1",
    name: "Kimchi",
    quantity: 1,
    price: 100,
    status: "preparing",
    kitchenStatus: "pending",
  };
  assert.equal(isBillableOrderItem(unpaidItem), true);

  const paidCookingItem: OrderItem = {
    id: "dish-1",
    name: "Kimchi",
    quantity: 1,
    price: 100,
    status: "preparing",
    kitchenStatus: "pending",
    modifiers: { paid: true, billSettled: true },
  };
  assert.equal(isBillableOrderItem(paidCookingItem), false);
});

test("isActiveFloorItem excludes split-bill settled items from floor cart", () => {
  const activeUnpaid: OrderItem = {
    id: "dish-2",
    name: "Bulgogi",
    quantity: 1,
    price: 250,
    status: "preparing",
    kitchenStatus: "pending",
  };
  assert.equal(isActiveFloorItem(activeUnpaid), true);

  const activePaidCooking: OrderItem = {
    id: "dish-2",
    name: "Bulgogi",
    quantity: 1,
    price: 250,
    status: "preparing",
    kitchenStatus: "pending",
    modifiers: { paid: true, billSettled: true },
  };
  assert.equal(isActiveFloorItem(activePaidCooking), false);
});
