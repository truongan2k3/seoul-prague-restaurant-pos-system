"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LanguageSelector } from "@/components/language-selector";
import { LiveClock } from "@/components/live-clock";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { useReceiptPrint } from "@/contexts/receipt-print-context";
import { useSettings } from "@/contexts/settings-context";
import { playTestAlertSound } from "@/lib/notification-sound";
import {
  pickPrinterBillDraft,
  type PrinterBillSettingsDraft,
} from "@/src/lib/settings-actions";
import { Monitor, Save, Tablet, Tv } from "lucide-react";

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
  const { settings, saving, error: settingsError, savePrinterBillSettings, uploadAlertSound } =
    useSettings();
  const { pushNotification } = useNotifications();
  const { printTestReceipt } = useReceiptPrint();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);

  const [draft, setDraft] = useState<PrinterBillSettingsDraft>(() => pickPrinterBillDraft(settings));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) {
      setDraft(pickPrinterBillDraft(settings));
    }
  }, [settings, dirty]);

  const updateDraft = <K extends keyof PrinterBillSettingsDraft>(
    key: K,
    value: PrinterBillSettingsDraft[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSavePrinterBill = async () => {
    const ok = await savePrinterBillSettings(draft);
    if (ok) {
      setDirty(false);
      pushNotification({
        id: "settings-saved",
        message: translate("settingsSavedSuccess"),
        playSound: false,
      });
    }
  };

  const handleSoundUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadAlertSound(file);
    event.target.value = "";
  };

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
        <div className="flex items-center gap-3">
          {saving && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{translate("settingsSaving")}</span>
          )}
          <LiveClock />
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 pb-24 md:p-6 md:pb-6">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
          {settingsError && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-2 dark:bg-red-950 dark:text-red-300">
              {settingsError}
            </p>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-6 md:col-span-2">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{translate("settingsReceiptPrinting")}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{translate("settingsPrinterHint")}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("settingsPrinterIp")}</span>
                <input
                  value={draft.printerIp}
                  onChange={(event) => updateDraft("printerIp", event.target.value)}
                  className="pos-input mt-1"
                  placeholder="192.168.1.200"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("settingsPrinterPort")}</span>
                <input
                  value={draft.printerPort}
                  onChange={(event) => updateDraft("printerPort", event.target.value)}
                  className="pos-input mt-1"
                  placeholder="9100"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => printTestReceipt()}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-600"
              >
                {translate("settingsTestPrint")} (Preview)
              </button>
            </div>

            <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
              <span className="text-sm text-gray-800 dark:text-gray-200">{translate("settingsAutoPrint")}</span>
              <input
                type="checkbox"
                checked={draft.autoPrintOnPayment}
                onChange={(event) => updateDraft("autoPrintOnPayment", event.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
            </label>

            <h3 className="mt-6 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {translate("settingsBillTemplate")}
            </h3>
            <div className="mt-3 space-y-3">
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("settingsReceiptHeader")}</span>
                <input
                  value={draft.receiptHeaderTitle}
                  onChange={(event) => updateDraft("receiptHeaderTitle", event.target.value)}
                  className="pos-input mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("settingsReceiptLegalName")}</span>
                <input
                  value={draft.receiptLegalName}
                  onChange={(event) => updateDraft("receiptLegalName", event.target.value)}
                  className="pos-input mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("settingsReceiptAddress")}</span>
                <input
                  value={draft.receiptAddress}
                  onChange={(event) => updateDraft("receiptAddress", event.target.value)}
                  className="pos-input mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("settingsReceiptCompanyAddress")}</span>
                <input
                  value={draft.receiptCompanyAddress}
                  onChange={(event) => updateDraft("receiptCompanyAddress", event.target.value)}
                  className="pos-input mt-1"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{translate("settingsReceiptIco")}</span>
                  <input
                    value={draft.receiptIco}
                    onChange={(event) => updateDraft("receiptIco", event.target.value)}
                    className="pos-input mt-1"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{translate("settingsReceiptDic")}</span>
                  <input
                    value={draft.receiptDic}
                    onChange={(event) => updateDraft("receiptDic", event.target.value)}
                    className="pos-input mt-1"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("settingsReceiptPhone")}</span>
                <input
                  value={draft.receiptPhone}
                  onChange={(event) => updateDraft("receiptPhone", event.target.value)}
                  className="pos-input mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("settingsReceiptFooter")}</span>
                <textarea
                  value={draft.receiptFooterNote}
                  onChange={(event) => updateDraft("receiptFooterNote", event.target.value)}
                  className="pos-input mt-1 min-h-[72px]"
                  placeholder={"Děkujeme za Vaši návštěvu!\nOtevírací doba: Po-Ne 10:00-22:00"}
                />
              </label>
            </div>

            <button
              type="button"
              disabled={saving || !dirty}
              onClick={() => void handleSavePrinterBill()}
              className="mt-6 hidden w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white shadow-md transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 md:flex"
            >
              <Save className="h-5 w-5" />
              💾 {translate("settingsSaveChanges")}
            </button>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{translate("settingsCustomSound")}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{translate("settingsSoundPreview")}</p>

            <audio
              ref={audioPreviewRef}
              src={settings.customAlertSoundUrl}
              controls
              className="mt-3 w-full"
              preload="metadata"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => playTestAlertSound(settings.customAlertSoundUrl)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-600"
              >
                {translate("settingsPlayTestSound")}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {translate("settingsUploadSound")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,audio/mpeg,audio/wav"
                className="hidden"
                onChange={(event) => void handleSoundUpload(event)}
              />
            </div>
          </section>

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

          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30 sm:p-6 md:col-span-2">
            <h2 className="font-semibold text-amber-900 dark:text-amber-200">{translate("managerPin")}</h2>
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
              Demo PIN for Administrator: <strong>1234</strong>. Required for voiding items, discounts, and clearing tables with active orders.
            </p>
          </section>
        </div>
      </div>

      {dirty && (
        <div className="pos-mobile-sticky-bar fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white p-3 shadow-lg md:hidden dark:border-gray-800 dark:bg-gray-900">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSavePrinterBill()}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-bold text-white disabled:opacity-50"
          >
            <Save className="h-5 w-5" />
            💾 {translate("settingsSaveChanges")}
          </button>
        </div>
      )}
    </div>
  );
}
