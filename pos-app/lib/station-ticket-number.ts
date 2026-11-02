import type { OrderLineModifiers } from "@/lib/types";

export function stationTicketNumber(modifiers?: OrderLineModifiers | null): number | undefined {
  const number=Number(modifiers?.kitchenOrderNumber);
  return Number.isSafeInteger(number)&&number>0?number:undefined;
}

/** Display metadata must not split otherwise identical POS item rows. */
export function withoutStationTicketNumber(modifiers?: OrderLineModifiers | null) {
  if(!modifiers)return modifiers;
  const {kitchenOrderNumber,kitchenOrderDay,...rest}=modifiers;
  return rest;
}
