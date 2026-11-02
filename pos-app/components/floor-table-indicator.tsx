"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { formatElapsed } from "@/components/live-clock";
import { formatCzk } from "@/lib/currency";
import { filterItemsForBoard } from "@/lib/order-board";
import { isKitchenMessageOrder } from "@/lib/kitchen-message-order";
import { calculateFloorBillTotal, getFloorBillPricing, subscribeFloorBillPricing } from "@/lib/floor-bill-preview";
import type { OrderItem, RestaurantTable } from "@/lib/types";

const FloorIndicatorClock = createContext({ nowMs: null as number | null, showTotal: false });

/** One shared local clock drives both the preserved seating timers and the five-second display cycle. */
export function FloorTableIndicatorProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const [clock, setClock] = useState({ nowMs: null as number | null, showTotal: false });
  useEffect(() => {
    if (!active) { setClock({ nowMs: null, showTotal: false }); return; }
    const started = Date.now();
    const tick = () => { const nowMs = Date.now(); setClock({ nowMs, showTotal: Math.floor((nowMs-started)/5_000)%2 === 1 }); };
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return <FloorIndicatorClock.Provider value={clock}>{children}</FloorIndicatorClock.Provider>;
}

export function FloorTableIndicator({ table, start, items, enablePriceRounding }: {
  table: RestaurantTable; start: Date; items: OrderItem[]; enablePriceRounding: boolean;
}) {
  const { nowMs, showTotal } = useContext(FloorIndicatorClock);
  const pricing = useSyncExternalStore(subscribeFloorBillPricing, () => getFloorBillPricing(table.id), () => undefined);
  const billItems = useMemo(() => filterItemsForBoard(items, "floor").filter(item => item.quantity > 0 && !item.isPrintedNote && !isKitchenMessageOrder(item)), [items]);
  const visitKey = table.occupiedAt?.toISOString() ?? null;
  const offerUnexpired = !pricing?.quote?.expiresAt || Date.parse(pricing.quote.expiresAt) > (nowMs ?? Date.now());
  const total = useMemo(() => calculateFloorBillTotal(billItems, visitKey, pricing, enablePriceRounding), [billItems, visitKey, pricing, enablePriceRounding, offerUnexpired]);
  const hasBill = table.status !== "empty" && table.paymentStatus !== "paid" && billItems.length > 0;
  const showAmount = hasBill && showTotal;
  const duration = nowMs === null ? "--:--" : formatElapsed(start, nowMs);
  const amount = formatCzk(total, Number.isInteger(total));
  const transition = "col-start-1 row-start-1 min-w-0 truncate text-center transition-opacity duration-200 motion-reduce:transition-none motion-reduce:delay-0";
  return <span title={showAmount ? amount : duration} className="inline-grid min-w-0 max-w-[70%] shrink-0 items-center rounded-md bg-black/20 px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--foreground)] dark:bg-white/10">
    <span aria-hidden={showAmount || nowMs === null} className={`${transition} font-mono ${showAmount ? "opacity-0 delay-0" : "opacity-100 delay-200"}`}>{duration}</span>
    {hasBill && <span aria-hidden={!showAmount} className={`${transition} text-[11px] font-bold text-[var(--pos-champagne-soft)] sm:text-xs ${showAmount ? "opacity-100 delay-200" : "opacity-0 delay-0"}`}>{amount}</span>}
  </span>;
}
