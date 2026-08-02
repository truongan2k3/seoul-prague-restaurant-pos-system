"use client";

import { LiveClock } from "@/components/live-clock";
import { InventoryManager } from "@/components/inventory-manager";
import { MenuManager } from "@/components/menu-manager";
import { useApp } from "@/contexts/app-context";
import type { InventoryItem, MenuItem } from "@/lib/types";

export function StorageView({
  inventory,
  menuItems,
  onRefresh,
}: {
  inventory: InventoryItem[];
  menuItems: MenuItem[];
  onRefresh: () => void;
}) {
  const { translate } = useApp();
  const commercial = inventory.filter((i) => i.category === "commercial");
  const internal = inventory.filter((i) => i.category === "internal");

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{translate("storage")}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Menu & inventory — synced with Supabase</p>
        </div>
        <LiveClock />
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <MenuManager menuItems={menuItems} onChange={onRefresh} />

          <div className="grid gap-6 lg:grid-cols-2">
            <InventoryManager
              title={translate("commercial")}
              items={commercial}
              defaultCategory="commercial"
              onChange={onRefresh}
            />
            <InventoryManager
              title={translate("internal")}
              items={internal}
              defaultCategory="internal"
              onChange={onRefresh}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
