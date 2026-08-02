"use client";

import Link from "next/link";
import { LanguageSelector } from "@/components/language-selector";
import { LiveClock } from "@/components/live-clock";
import { useApp } from "@/contexts/app-context";
import { Monitor, Tablet, Tv } from "lucide-react";

export function SettingsView() {
  const {
    translate,
    theme,
    setTheme,
    receiptShowEur,
    receiptShowUsd,
    eurRate,
    usdRate,
    setReceiptShowEur,
    setReceiptShowUsd,
    setEurRate,
    setUsdRate,
    soundMainEnabled,
    soundKitchenEnabled,
    setSoundMainEnabled,
    setSoundKitchenEnabled,
  } = useApp();

  const devices = [
    { href: "/", label: translate("posWindows"), icon: Monitor, desc: "Cashier & floor manager" },
    { href: "/server", label: translate("tabletServer"), icon: Tablet, desc: "Table ordering" },
    { href: "/kds", label: translate("tabletKds"), icon: Tablet, desc: "Kitchen display" },
    { href: "/bar", label: translate("barScreen"), icon: Tv, desc: "Bar display" },
  ];

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{translate("settings")}</h1>
        <LiveClock />
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{translate("devices")}</h2>
            <ul className="mt-4 space-y-2">
              {devices.map(({ href, label, icon: Icon, desc }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex items-center gap-4 rounded-lg border border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
                  >
                    <Icon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{translate("language")}</h2>
            <LanguageSelector variant="segmented" className="mt-3" />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{translate("receiptCurrency")}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              POS amounts are always in CZK. These options add reference lines on printed receipts only.
            </p>
            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                <span className="text-sm text-gray-800 dark:text-gray-200">{translate("showEurOnReceipt")}</span>
                <input
                  type="checkbox"
                  checked={receiptShowEur}
                  onChange={(event) => setReceiptShowEur(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                <span className="text-sm text-gray-800 dark:text-gray-200">{translate("showUsdOnReceipt")}</span>
                <input
                  type="checkbox"
                  checked={receiptShowUsd}
                  onChange={(event) => setReceiptShowUsd(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </label>
            </div>
            {(receiptShowEur || receiptShowUsd) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {receiptShowEur && (
                  <label className="block text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{translate("eurRate")}</span>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        step={0.01}
                        value={eurRate}
                        onChange={(event) => setEurRate(Number(event.target.value))}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                      />
                      <span className="shrink-0 text-gray-600 dark:text-gray-300">Kč</span>
                    </div>
                  </label>
                )}
                {receiptShowUsd && (
                  <label className="block text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{translate("usdRate")}</span>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        step={0.01}
                        value={usdRate}
                        onChange={(event) => setUsdRate(Number(event.target.value))}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                      />
                      <span className="shrink-0 text-gray-600 dark:text-gray-300">Kč</span>
                    </div>
                  </label>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {translate("soundNotifications")}
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Toggle bell sounds on this device. Visual toasts still appear when sound is off.
            </p>
            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                <span className="text-sm text-gray-800 dark:text-gray-200">{translate("soundMainPos")}</span>
                <input
                  type="checkbox"
                  checked={soundMainEnabled}
                  onChange={(event) => setSoundMainEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                <span className="text-sm text-gray-800 dark:text-gray-200">{translate("soundKitchen")}</span>
                <input
                  type="checkbox"
                  checked={soundKitchenEnabled}
                  onChange={(event) => setSoundKitchenEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Theme</h2>
            <button
              type="button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="mt-3 pos-filter-btn-active px-4 py-2"
            >
              {theme === "light" ? translate("darkMode") : translate("lightMode")}
            </button>
          </section>

          <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/30">
            <h2 className="font-semibold text-amber-900 dark:text-amber-200">{translate("managerPin")}</h2>
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
              Demo PIN for Master Liu: <strong>1234</strong>. Required for voiding items, discounts, and clearing tables with active orders.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
