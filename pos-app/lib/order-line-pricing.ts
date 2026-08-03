import type { MenuItem, OrderItem } from "@/lib/types";

export type LinePriceAdjustMode = "percent" | "custom";

export function resolveMenuUnitPrice(
  line: Pick<OrderItem, "menuItemId" | "price">,
  menuItems: MenuItem[],
): number | undefined {
  if (!line.menuItemId) return undefined;
  return menuItems.find((item) => item.id === line.menuItemId)?.price;
}

export function resolveOriginalUnitPrice(
  line: Pick<OrderItem, "menuItemId" | "price" | "originalPrice">,
  menuItems: MenuItem[],
): number {
  return line.originalPrice ?? resolveMenuUnitPrice(line, menuItems) ?? line.price;
}

export function isLinePriceAdjusted(
  line: Pick<OrderItem, "menuItemId" | "price" | "originalPrice">,
  menuItems: MenuItem[],
): boolean {
  const original = resolveOriginalUnitPrice(line, menuItems);
  return Math.abs(line.price - original) > 0.009;
}

export function priceFromPercentDiscount(originalPrice: number, percentOff: number): number {
  const pct = Math.min(100, Math.max(0, percentOff));
  return Math.max(0, originalPrice * (1 - pct / 100));
}

export function inferPercentDiscount(
  originalPrice: number,
  effectivePrice: number,
): number {
  if (originalPrice <= 0) return 0;
  const pct = (1 - effectivePrice / originalPrice) * 100;
  return Math.min(100, Math.max(0, Math.round(pct * 100) / 100));
}

export function withAdjustedLinePrice(
  line: OrderItem,
  menuItems: MenuItem[],
  mode: LinePriceAdjustMode,
  value: number,
): OrderItem {
  const originalPrice = resolveOriginalUnitPrice(line, menuItems);
  const price =
    mode === "percent" ? priceFromPercentDiscount(originalPrice, value) : Math.max(0, value);

  return {
    ...line,
    originalPrice,
    price: Math.round(price * 100) / 100,
  };
}

export function withResetLinePrice(line: OrderItem, menuItems: MenuItem[]): OrderItem {
  const originalPrice = resolveOriginalUnitPrice(line, menuItems);
  return {
    ...line,
    originalPrice,
    price: originalPrice,
  };
}
