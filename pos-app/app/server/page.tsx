"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionHealth } from "@/hooks/use-session-health";
import { useApp } from "@/contexts/app-context";
import { useReceiptPrint } from "@/contexts/receipt-print-context";
import { useSettings } from "@/contexts/settings-context";
import { NewOrderModal } from "@/components/new-order-modal";
import { LanguageSelector } from "@/components/language-selector";
import type { MenuCategoryRecord, MenuItem, OrderItem, RestaurantTable } from "@/lib/types";
import {
  fetchCategories,
  fetchTables,
  loadMenuItemsResolved,
  mapCategoriesResponse,
  mapTablesResponse,
  subscribeToCategoryChanges,
  subscribeToMenuChanges,
  subscribeToTableChanges,
} from "@/src/lib/supabase-data";
import { shouldPrintKitchenOnSend, applyFulfillmentModeToNewOrders } from "@/lib/kitchen-fulfillment-mode";
import { appendOrdersToTable, occupyTable } from "@/src/lib/table-actions";

type OrderModalState = {
  table: RestaurantTable;
  mode: "new" | "append";
} | null;

function ServerApp() {
  const { translate, staff, logAction, language, setLanguage } = useApp();
  const { settings } = useSettings();
  const { printKitchenOrder } = useReceiptPrint();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategoryRecord[]>([]);
  const [orderModal, setOrderModal] = useState<OrderModalState>(null);
  const [isSaving, setIsSaving] = useState(false);
  const actionLockRef = useRef(false);

  const reload = useCallback(async () => {
    const [t, m, c] = await Promise.all([
      fetchTables(),
      loadMenuItemsResolved(),
      fetchCategories(),
    ]);
    if (!t.error) setTables(mapTablesResponse(t.data));
    if (!m.error && m.data) setMenuItems(m.data);
    if (!c.error) setCategories(mapCategoriesResponse(c.data));
  }, []);

  useEffect(() => {
    void reload();
    const u1 = subscribeToTableChanges(() => void reload());
    const u2 = subscribeToMenuChanges(() => void reload());
    const u3 = subscribeToCategoryChanges(() => void reload());
    return () => { u1(); u2(); u3(); };
  }, [reload]);

  useSessionHealth({
    onRefresh: () => void reload(),
    isBusy: () => orderModal != null || isSaving,
  });

  const handleTableClick = (table: RestaurantTable) => {
    setOrderModal({
      table,
      mode: table.status === "empty" ? "new" : "append",
    });
  };

  const handleSend = async (orders: OrderItem[]) => {
    if (!orderModal) return;
    if (actionLockRef.current) return;

    actionLockRef.current = true;
    setIsSaving(true);

    try {
      const preparedOrders = applyFulfillmentModeToNewOrders(
        orders,
        settings.kitchenFulfillmentMode,
      );
      const isAppend = orderModal.mode === "append";
      const { error } = isAppend
        ? await appendOrdersToTable(
            orderModal.table.id,
            preparedOrders,
            staff?.id,
            staff?.name,
            orderModal.table.label,
          )
        : await occupyTable(
            orderModal.table.id,
            preparedOrders,
            staff?.id,
            staff?.name,
            orderModal.table.label,
          );

      if (error) return;

      logAction(isAppend ? "server add items" : "server order", `Table ${orderModal.table.label}`);

      if (shouldPrintKitchenOnSend(settings) && !settings.kitchenPrintViaStation) {
        void printKitchenOrder({
          tableLabel: orderModal.table.label,
          orders: preparedOrders,
          menuItems,
        }).catch((printError) => {
          console.warn("[KitchenPrint] Failed:", printError);
        });
      }

      setOrderModal(null);
      void reload();
    } finally {
      actionLockRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
      <header className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            {translate("tabletServer")}
          </p>
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{staff?.name}</p>
        </div>
        <LanguageSelector
          variant="flag-menu"
          language={language}
          onLanguageChange={setLanguage}
        />
      </header>
      <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 md:gap-4 lg:grid-cols-6">
        {tables.map((table) => (
          <button
            key={table.id}
            type="button"
            onClick={() => handleTableClick(table)}
            className={`rounded-xl border p-4 text-center transition-colors hover:shadow-md ${
              table.status === "empty"
                ? "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                : table.status === "ready"
                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                  : "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30"
            }`}
          >
            <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{table.label}</span>
            <p className="mt-1 text-xs capitalize text-zinc-600 dark:text-zinc-400">
              {translate(table.status === "empty" ? "empty" : table.status)}
            </p>
            {table.status !== "empty" && table.orders && table.orders.length > 0 && (
              <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                {table.orders.length} item(s)
              </p>
            )}
          </button>
        ))}
      </div>
      {orderModal && (
        <NewOrderModal
          open
          tableLabel={orderModal.table.label}
          menuItems={menuItems.filter((m) => m.isAvailable)}
          categories={categories}
          mode={orderModal.mode}
          existingOrders={orderModal.table.orders ?? []}
          onClose={() => setOrderModal(null)}
          onSendToKitchen={handleSend}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}

export default function ServerPage() {
  return <ServerApp />;
}
