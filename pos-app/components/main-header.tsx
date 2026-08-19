"use client";

import { LiveClock } from "@/components/live-clock";
import { NotificationBell } from "@/components/notification-bell";
import { useApp } from "@/contexts/app-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { NavId } from "@/lib/types";

const TAB_LABEL_KEYS: Record<NavId, TranslationKey> = {
  map: "map",
  order: "order",
  reservations: "reservations",
  history: "history",
  summary: "summary",
  storage: "storage",
  dynamicQr: "dynamicQrServices",
  staff: "staffManagement",
  settings: "settings",
};

interface MainHeaderProps {
  activeTab: NavId;
}

export function MainHeader({ activeTab }: MainHeaderProps) {
  const { translate } = useApp();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
      <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {translate(TAB_LABEL_KEYS[activeTab])}
      </h1>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <LiveClock className="text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400" />
      </div>
    </header>
  );
}
