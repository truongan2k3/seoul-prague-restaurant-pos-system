"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/contexts/app-context";
import { NewOrderModal } from "@/components/new-order-modal";
import type { MenuCategoryRecord, MenuItem, OrderItem, RestaurantTable } from "@/lib/types";
import {
  fetchCategories,
  fetchMenuItems,
  fetchTables,
  mapCategoriesResponse,
  mapMenuItemsResponse,
  mapTablesResponse,
  subscribeToCategoryChanges,
  subscribeToMenuChanges,
  subscribeToTableChanges,
} from "@/src/lib/supabase-data";
import { appendOrdersToTable, occupyTable } from "@/src/lib/table-actions";

type OrderModalState = {
  table: RestaurantTable;
  mode: "new" | "append";
} | null;

function ServerApp() {
  const { translate, staff, logAction } = useApp();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategoryRecord[]>([]);
  const [orderModal, setOrderModal] = useState<OrderModalState>(null);
  const [isSaving, setIsSaving] = useState(false);

  const reload = useCallback(async () => {
    const [t, m, c] = await Promise.all([fetchTables(), fetchMenuItems(), fetchCategories()]);
    if (!t.error) setTables(mapTablesResponse(t.data));
    if (!m.error) setMenuItems(mapMenuItemsResponse(m.data));
    if (!c.error) setCategories(mapCategoriesResponse(c.data));
  }, []);

  useEffect(() => {
    void reload();
    const u1 = subscribeToTableChanges(() => void reload());
    const u2 = subscribeToMenuChanges(() => void reload());
    const u3 = subscribeToCategoryChanges(() => void reload());
    return () => { u1(); u2(); u3(); };
  }, [reload]);

  const handleTableClick = (table: RestaurantTable) => {
    setOrderModal({
      table,
      mode: table.status === "empty" ? "new" : "append",
    });
  };

  const handleSend = async (orders: OrderItem[]) => {
    if (!orderModal) return;
    setIsSaving(true);

    const isAppend = orderModal.mode === "append";
    const { error } = isAppend
      ? await appendOrdersToTable(orderModal.table.id, orders, staff?.id, staff?.name)
      : await occupyTable(orderModal.table.id, orders, staff?.id, staff?.name);

    setIsSaving(false);
    if (error) return;

    logAction(isAppend ? "server add items" : "server order", `Table ${orderModal.table.label}`);
    setOrderModal(null);
    void reload();
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          {translate("tabletServer")}
        </p>
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">{staff?.name}</p>
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
