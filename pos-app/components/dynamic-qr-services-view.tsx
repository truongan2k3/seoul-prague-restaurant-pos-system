"use client";

import { BellRing, ConciergeBell, Flame, QrCode, Soup } from "lucide-react";
import { LiveClock } from "@/components/live-clock";
import { NotificationBell } from "@/components/notification-bell";
import { useApp } from "@/contexts/app-context";

const PLANNED_FEATURES = [
  { key: "dynamicQrPlannedScan", icon: QrCode },
  { key: "dynamicQrPlannedCallServer", icon: ConciergeBell },
  { key: "dynamicQrPlannedBanchan", icon: Soup },
  { key: "dynamicQrPlannedGrill", icon: Flame },
  { key: "dynamicQrPlannedMore", icon: BellRing },
] as const;

export function DynamicQrServicesView() {
  const { translate } = useApp();

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-lg font-semibold">{translate("dynamicQrServices")}</h1>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <LiveClock />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col items-center py-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            <QrCode className="h-10 w-10" strokeWidth={1.75} />
          </div>

          <span className="mt-6 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
            {translate("dynamicQrComingSoonBadge")}
          </span>

          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-gray-100">
            {translate("dynamicQrComingSoonTitle")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {translate("dynamicQrComingSoonHint")}
          </p>

          <div className="mt-8 w-full rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {translate("dynamicQrPlannedTitle")}
            </h3>
            <ul className="mt-4 space-y-3">
              {PLANNED_FEATURES.map(({ key, icon: Icon }) => (
                <li
                  key={key}
                  className="flex items-start gap-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-950/60"
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                    {translate(key)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white/60 px-4 py-3 font-mono text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
            {translate("dynamicQrExampleUrl")}
          </p>
        </div>
      </div>
    </div>
  );
}
