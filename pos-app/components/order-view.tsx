"use client";

import { useMemo } from "react";
import { ElapsedTimer, LiveClock } from "@/components/live-clock";
import { MapReservationTicker } from "@/components/map-reservation-ticker";
import { NotificationBell } from "@/components/notification-bell";
import { OrderItemChecklist } from "@/components/order-item-checklist";
import { useApp } from "@/contexts/app-context";
import { filterItemsForBoard } from "@/lib/order-board";
import { aggregateDisplayItems } from "@/lib/order-item-aggregate";
import { resolveTableOccupiedSince } from "@/lib/order-item-timers";
import { isDrinkOrderItem } from "@/lib/order-routing";
import { isTablePaidInProgress } from "@/lib/table-payment";
import { formatPrice, type TranslationKey } from "@/lib/i18n/translations";
import type { MenuItem, OrderItem, RestaurantTable } from "@/lib/types";

type TableOrderBundle = {
  table: RestaurantTable;
  rawItems: OrderItem[];
  foodItems: OrderItem[];
  drinkItems: OrderItem[];
  total: number;
};

function OrderItemGroup({
  title,
  items,
  menuItems,
  language,
  translate,
}: {
  title: string;
  items: OrderItem[];
  menuItems: MenuItem[];
  language: ReturnType<typeof useApp>["language"];
  translate: (key: TranslationKey) => string;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      <OrderItemChecklist
        items={items}
        menuItems={menuItems}
        language={language}
        translate={translate}
        variant="floor"
        dense
      />
    </section>
  );
}

function OrderCard({
  bundle,
  translate,
  menuItems,
  language,
  onOpen,
  onCheckout,
  onChangeTable,
  checkoutBusy,
}: {
  bundle: TableOrderBundle;
  translate: ReturnType<typeof useApp>["translate"];
  menuItems: MenuItem[];
  language: ReturnType<typeof useApp>["language"];
  onOpen: () => void;
  onCheckout: () => void;
  onChangeTable: () => void;
  checkoutBusy?: boolean;
}) {
  const { table, rawItems, foodItems, drinkItems, total } = bundle;
  const isReady = table.status === "ready";
  const isPaidInProgress = isTablePaidInProgress(table);
  const tableOccupiedSince = resolveTableOccupiedSince(table, rawItems);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`flex w-[min(85vw,320px)] shrink-0 snap-start cursor-pointer flex-col rounded-xl border p-4 shadow-sm transition-opacity hover:opacity-95 ${
        isPaidInProgress
          ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/40"
          : isReady
            ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30"
            : "border-orange-200 bg-white dark:border-orange-900 dark:bg-gray-900"
      }`}
    >
      <div className="flex shrink-0 items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {translate("table")}
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{table.label}</p>
        </div>
        <div className="text-right">
          {isPaidInProgress ? (
            <p className="inline-flex rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">
              {translate("paidBadge")}
            </p>
          ) : (
            <p
              className={`text-xs font-medium ${
                isReady
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-orange-600 dark:text-orange-400"
              }`}
            >
              {translate(isReady ? "ready" : "waiting")}
            </p>
          )}
          {tableOccupiedSince && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              <span className="text-gray-500 dark:text-gray-400">{translate("tableOccupiedSince")}</span>
              <ElapsedTimer
                start={tableOccupiedSince}
                className="font-mono tabular-nums text-gray-900 dark:text-gray-100"
              />
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-4 border-t border-gray-100 pt-3 dark:border-gray-800">
        <OrderItemGroup
          title={translate("summaryFood")}
          items={foodItems}
          menuItems={menuItems}
          language={language}
          translate={translate}
        />
        <OrderItemGroup
          title={translate("summaryDrinks")}
          items={drinkItems}
          menuItems={menuItems}
          language={language}
          translate={translate}
        />
      </div>

      <footer
        className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between text-sm font-bold text-gray-900 dark:text-gray-100">
          <span>{translate("total")}</span>
          <span className="text-base tabular-nums">{formatPrice(total)}</span>
        </div>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={onCheckout}
            disabled={checkoutBusy || rawItems.length === 0 || isPaidInProgress}
            className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {translate("checkout")}
          </button>
          <button
            type="button"
            onClick={onChangeTable}
            className="shrink-0 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-amber-950 transition-colors hover:bg-amber-500"
          >
            {translate("changeTable")}
          </button>
        </div>
      </footer>
    </article>
  );
}

export function OrderView({
  tables,
  orderItems,
  menuItems,
  onOpenTable,
  onCheckout,
  onChangeTable,
  actionError,
  checkoutBusy,
}: {
  tables: RestaurantTable[];
  orderItems: OrderItem[];
  menuItems: MenuItem[];
  onOpenTable: (tableId: string) => void;
  onCheckout: (tableId: string) => void;
  onChangeTable: (tableId: string) => void;
  actionError?: string | null;
  checkoutBusy?: boolean;
}) {
  const { translate, language } = useApp();

  const tableBundles = useMemo(() => {
    const tableIdsWithWork = new Set(orderItems.map((item) => item.tableId).filter(Boolean));

    return tables
      .filter((t) => t.status !== "empty" && tableIdsWithWork.has(t.id))
      .sort((a, b) => (a.occupiedAt?.getTime() ?? 0) - (b.occupiedAt?.getTime() ?? 0))
      .map((table): TableOrderBundle => {
        const rawItems = filterItemsForBoard(
          orderItems.filter((item) => item.tableId === table.id),
          "floor",
        );
        const rawFood = rawItems.filter((item) => !isDrinkOrderItem(item, menuItems));
        const rawDrinks = rawItems.filter((item) => isDrinkOrderItem(item, menuItems));
        const allItems = aggregateDisplayItems(rawItems);
        const total = allItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

        return {
          table,
          rawItems,
          foodItems: aggregateDisplayItems(rawFood),
          drinkItems: aggregateDisplayItems(rawDrinks),
          total,
        };
      });
  }, [tables, orderItems, menuItems]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {translate("order")}
          </h1>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {tableBundles.length} open
          </span>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <LiveClock />
        </div>
      </header>

      {actionError && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {actionError}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {tableBundles.length === 0 ? (
          <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            {translate("noOrders")}
          </div>
        ) : (
          <div className="-mx-1 flex items-start snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-1 pb-2">
            {tableBundles.map((bundle) => (
              <OrderCard
                key={bundle.table.id}
                bundle={bundle}
                translate={translate}
                menuItems={menuItems}
                language={language}
                onOpen={() => onOpenTable(bundle.table.id)}
                onCheckout={() => onCheckout(bundle.table.id)}
                onChangeTable={() => onChangeTable(bundle.table.id)}
                checkoutBusy={checkoutBusy}
              />
            ))}
          </div>
        )}
      </div>

      <MapReservationTicker />
    </div>
  );
}
