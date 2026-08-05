"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LanguageSelector } from "@/components/language-selector";
import { LiveClock } from "@/components/live-clock";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useNotifications } from "@/contexts/notification-context";
import { useReceiptPrint } from "@/contexts/receipt-print-context";
import { useSettings } from "@/contexts/settings-context";
import { playTestAlertSound } from "@/lib/notification-sound";
import {
  pickSettingsPageDraft,
  type SettingsPageDraft,
} from "@/src/lib/settings-actions";
import { WEEKDAY_KEYS } from "@/lib/reservation-slots";
import { RECEIPT_FONT_OPTIONS } from "@/lib/receipt-print-styles";
import {
  fromDatetimeLocalValue,
  MARQUEE_SPEED_MAX,
  MARQUEE_SPEED_MIN,
  toDatetimeLocalValue,
} from "@/lib/marquee-settings";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ReceiptFontFamily, WeekdayKey } from "@/lib/types";
import { testTerminalConnection } from "@/src/lib/terminalApi";
import { isCfdGifMedia } from "@/lib/cfd-display";
import {
  clearBusinessLogoAction,
  uploadBusinessLogoAction,
} from "@/src/lib/business-auth-actions";
import { Monitor, Save, Tablet, Tv, CreditCard } from "lucide-react";

const RECEIPT_FONT_LABEL_KEYS: Record<ReceiptFontFamily, TranslationKey> = {
  consolas: "settingsReceiptFontConsolas",
  courier: "settingsReceiptFontCourier",
  arial: "settingsReceiptFontArial",
  tahoma: "settingsReceiptFontTahoma",
  lucida: "settingsReceiptFontLucida",
  georgia: "settingsReceiptFontGeorgia",
};

export function SettingsView() {
  const {
    translate,
    theme,
    setTheme,
    receiptShowUsd,
    usdRate,
    setReceiptShowUsd,
    setUsdRate,
    soundMainEnabled,
    soundKitchenEnabled,
    setSoundMainEnabled,
    setSoundKitchenEnabled,
  } = useApp();
  const { settings, saving, error: settingsError, saveSettingsPageDraft, uploadAlertSound, uploadCfdAdVideo, uploadCfdReviewQrImage, saveSettings } =
    useSettings();
  const { business, updateBranding } = useAuth();
  const { pushNotification } = useNotifications();
  const { printTestReceipt } = useReceiptPrint();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const cfdVideoInputRef = useRef<HTMLInputElement>(null);
  const cfdQrInputRef = useRef<HTMLInputElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);

  const [draft, setDraft] = useState<SettingsPageDraft>(() => pickSettingsPageDraft(settings));
  const [dirty, setDirty] = useState(false);
  const [terminalTestMessage, setTerminalTestMessage] = useState<string | null>(null);
  const [terminalTesting, setTerminalTesting] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  const weekdayLabels: Record<WeekdayKey, string> = {
    monday: translate("settingsDayMonday"),
    tuesday: translate("settingsDayTuesday"),
    wednesday: translate("settingsDayWednesday"),
    thursday: translate("settingsDayThursday"),
    friday: translate("settingsDayFriday"),
    saturday: translate("settingsDaySaturday"),
    sunday: translate("settingsDaySunday"),
  };

  useEffect(() => {
    if (!dirty) {
      setDraft(pickSettingsPageDraft(settings));
    }
  }, [settings, dirty]);

  const updateDraft = <K extends keyof SettingsPageDraft>(
    key: K,
    value: SettingsPageDraft[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const updateOperatingHours = (
    day: WeekdayKey,
    patch: Partial<SettingsPageDraft["reservationOperatingHours"][WeekdayKey]>,
  ) => {
    setDraft((prev) => ({
      ...prev,
      reservationOperatingHours: {
        ...prev.reservationOperatingHours,
        [day]: { ...prev.reservationOperatingHours[day], ...patch },
      },
    }));
    setDirty(true);
  };

  const handleSaveSettings = async () => {
    const ok = await saveSettingsPageDraft(draft);
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

  const handleCfdVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadCfdAdVideo(file);
    event.target.value = "";
  };

  const handleCfdQrUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadCfdReviewQrImage(file);
    event.target.value = "";
  };

  const clearCfdVideo = async () => {
    await saveSettings({ cfdAdVideoUrl: "" });
  };

  const clearCfdQrImage = async () => {
    await saveSettings({ cfdReviewQrImageUrl: "" });
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !business) return;

    setLogoUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadBusinessLogoAction(business.id, formData);
    setLogoUploading(false);

    if (result.ok) {
      updateBranding({ logoUrl: result.logoUrl });
      pushNotification({ message: translate("settingsLogoUpdated") });
    } else {
      pushNotification({ message: result.error ?? translate("settingsLogoUploadFailed") });
    }
  };

  const clearBusinessLogo = async () => {
    if (!business) return;
    const result = await clearBusinessLogoAction(business.id);
    if (result.ok) {
      updateBranding({ logoUrl: "" });
    }
  };

  const handleTestTerminal = async () => {
    setTerminalTesting(true);
    setTerminalTestMessage(null);
    const result = await testTerminalConnection({
      terminalType: draft.terminalType,
      terminalIp: draft.terminalIp,
      terminalPort: draft.terminalPort,
      terminalPosId: draft.terminalPosId,
      terminalConnectionMode: draft.terminalConnectionMode,
    });
    setTerminalTesting(false);
    setTerminalTestMessage(result.message);
  };

  const devices = [
    { href: "/", label: translate("posWindows"), icon: Monitor, desc: "Cashier & floor manager" },
    { href: "/server", label: translate("tabletServer"), icon: Tablet, desc: "Table ordering" },
    { href: "/kds", label: translate("tabletKds"), icon: Tablet, desc: "Kitchen display" },
    { href: "/bar", label: translate("barScreen"), icon: Tv, desc: "Bar display" },
    { href: "/client", label: translate("customerDisplay"), icon: Monitor, desc: translate("settingsCfdDeviceHint") },
  ];

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{translate("settings")}</h1>
        <div className="flex items-center gap-3">
          {saving && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{translate("settingsSaving")}</span>
          )}
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={() => void handleSaveSettings()}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {translate("settingsSaveChanges")}
          </button>
          <LiveClock />
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
          {settingsError && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-2 dark:bg-red-950 dark:text-red-300">
              {settingsError}
            </p>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-6 md:col-span-2">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{translate("settingsBusinessBranding")}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{translate("settingsBusinessBrandingHint")}</p>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              {business?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={business.logoUrl}
                  alt={business.name}
                  className="h-20 w-20 rounded-xl border border-gray-200 object-cover dark:border-gray-700"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-emerald-600 text-2xl font-bold text-white">
                  {(business?.name ?? "P").charAt(0)}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{business?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{translate("settingsBusinessLogoHint")}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={logoUploading}
                onClick={() => logoInputRef.current?.click()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {logoUploading ? translate("settingsSaving") : translate("settingsUploadLogo")}
              </button>
              {business?.logoUrl && (
                <button
                  type="button"
                  onClick={() => void clearBusinessLogo()}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-600"
                >
                  {translate("settingsRemoveLogo")}
                </button>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(event) => void handleLogoUpload(event)}
              />
            </div>
          </section>

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
              {translate("settingsReceiptPrintQuality")}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {translate("settingsReceiptPrintQualityHint")}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-gray-500 dark:text-gray-400">{translate("settingsReceiptFontFamily")}</span>
                <select
                  value={draft.receiptFontFamily}
                  onChange={(event) =>
                    updateDraft(
                      "receiptFontFamily",
                      event.target.value as SettingsPageDraft["receiptFontFamily"],
                    )
                  }
                  className="pos-input mt-1"
                >
                  {RECEIPT_FONT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id} style={{ fontFamily: option.stack }}>
                      {translate(RECEIPT_FONT_LABEL_KEYS[option.id])}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("settingsReceiptFontSize")}</span>
                <select
                  value={draft.receiptFontSize}
                  onChange={(event) =>
                    updateDraft("receiptFontSize", event.target.value as SettingsPageDraft["receiptFontSize"])
                  }
                  className="pos-input mt-1"
                >
                  <option value="normal">{translate("settingsReceiptFontNormal")}</option>
                  <option value="medium">{translate("settingsReceiptFontMedium")}</option>
                  <option value="large">{translate("settingsReceiptFontLarge")}</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("settingsReceiptFontWeight")}</span>
                <select
                  value={draft.receiptFontWeight}
                  onChange={(event) =>
                    updateDraft(
                      "receiptFontWeight",
                      event.target.value as SettingsPageDraft["receiptFontWeight"],
                    )
                  }
                  className="pos-input mt-1"
                >
                  <option value="normal">{translate("settingsReceiptWeightNormal")}</option>
                  <option value="bold">{translate("settingsReceiptWeightBold")}</option>
                  <option value="extrabold">{translate("settingsReceiptWeightExtraBold")}</option>
                </select>
              </label>
            </div>

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
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-6 md:col-span-2">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {translate("settingsDisplayCurrency")}
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {translate("settingsDisplayCurrencyHint")}
            </p>

            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                <span className="text-sm text-gray-800 dark:text-gray-200">
                  {translate("settingsShowPricesOnOrder")}
                </span>
                <input
                  type="checkbox"
                  checked={draft.showPricesOnOrderScreen}
                  onChange={(event) => updateDraft("showPricesOnOrderScreen", event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </label>

              <div className="rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {translate("settingsMenuItemLayout")}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {translate("settingsMenuItemLayoutHint")}
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(
                    [
                      { value: "vertical", label: translate("settingsMenuLayoutVertical") },
                      { value: "horizontal", label: translate("settingsMenuLayoutHorizontal") },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateDraft("menuItemLayout", option.value)}
                      className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition ${
                        draft.menuItemLayout === option.value
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                <span className="text-sm text-gray-800 dark:text-gray-200">
                  {translate("settingsRoundPrices")}
                </span>
                <input
                  type="checkbox"
                  checked={draft.enablePriceRounding}
                  onChange={(event) => updateDraft("enablePriceRounding", event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                <span className="text-sm text-gray-800 dark:text-gray-200">
                  {translate("settingsShowEurCurrency")}
                </span>
                <input
                  type="checkbox"
                  checked={draft.showEurCurrency}
                  onChange={(event) => updateDraft("showEurCurrency", event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </label>
            </div>

            {draft.showEurCurrency && (
              <label className="mt-4 block text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  {translate("settingsEurExchangeRate")}
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={0.01}
                    value={draft.eurExchangeRate}
                    onChange={(event) => updateDraft("eurExchangeRate", Number(event.target.value))}
                    className="pos-input"
                  />
                  <span className="shrink-0 text-gray-600 dark:text-gray-300">Kč</span>
                </div>
              </label>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-6 md:col-span-2">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {translate("settingsMarquee")}
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {translate("settingsMarqueeHint")}
            </p>

            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                <span className="text-sm text-gray-800 dark:text-gray-200">
                  {translate("settingsMarqueeEnabled")}
                </span>
                <input
                  type="checkbox"
                  checked={draft.marqueeEnabled}
                  onChange={(event) => updateDraft("marqueeEnabled", event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </label>

              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("settingsMarqueeText")}</span>
                <textarea
                  value={draft.marqueeText}
                  onChange={(event) => updateDraft("marqueeText", event.target.value)}
                  rows={2}
                  placeholder={translate("settingsMarqueeTextPlaceholder")}
                  className="pos-input mt-1 min-h-[72px] resize-y"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {translate("settingsMarqueeSpeed")}
                  </span>
                  <input
                    type="number"
                    min={MARQUEE_SPEED_MIN}
                    max={MARQUEE_SPEED_MAX}
                    value={draft.marqueeDurationSeconds}
                    onChange={(event) =>
                      updateDraft("marqueeDurationSeconds", Number(event.target.value))
                    }
                    className="pos-input mt-1"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {translate("settingsMarqueeSpeedHint")}
                  </p>
                </label>

                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {translate("settingsMarqueeFont")}
                  </span>
                  <select
                    value={draft.marqueeFontFamily}
                    onChange={(event) =>
                      updateDraft("marqueeFontFamily", event.target.value as ReceiptFontFamily)
                    }
                    className="pos-input mt-1"
                  >
                    {RECEIPT_FONT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {translate(RECEIPT_FONT_LABEL_KEYS[option.id])}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  {translate("settingsMarqueeEndAt")}
                </span>
                <input
                  type="datetime-local"
                  value={toDatetimeLocalValue(draft.marqueeEndAt)}
                  onChange={(event) =>
                    updateDraft("marqueeEndAt", fromDatetimeLocalValue(event.target.value))
                  }
                  className="pos-input mt-1"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {translate("settingsMarqueeEndAtHint")}
                </p>
              </label>

              {draft.marqueeEnabled && draft.marqueeText.trim() && (
                <div className="overflow-hidden rounded-lg border border-amber-300 bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40">
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    {translate("settingsMarqueePreview")}
                  </p>
                  <div
                    className="overflow-hidden py-2"
                    style={{ fontFamily: RECEIPT_FONT_OPTIONS.find((f) => f.id === draft.marqueeFontFamily)?.stack }}
                  >
                    <div
                      className="pos-marquee-track flex w-max items-center"
                      style={{ animationDuration: `${draft.marqueeDurationSeconds}s` }}
                    >
                      <span className="pos-marquee-segment px-6 text-sm font-semibold text-amber-950 dark:text-amber-100">
                        {draft.marqueeText.trim()}
                      </span>
                      <span className="pos-marquee-segment px-6 text-sm font-semibold text-amber-950 dark:text-amber-100" aria-hidden>
                        {draft.marqueeText.trim()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-6 md:col-span-2">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {translate("settingsReservationSlots")}
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {translate("settingsReservationSlotsHint")}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("settingsSlotInterval")}</span>
                <select
                  value={draft.reservationTimeStep}
                  onChange={(event) => updateDraft("reservationTimeStep", Number(event.target.value))}
                  className="pos-input mt-1"
                >
                  <option value={15}>{translate("settingsSlot15")}</option>
                  <option value={30}>{translate("settingsSlot30")}</option>
                  <option value={60}>{translate("settingsSlot60")}</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  {translate("settingsTableHoldingTime")}
                </span>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={draft.reservationTableHoldingTime}
                  onChange={(event) =>
                    updateDraft("reservationTableHoldingTime", Number(event.target.value))
                  }
                  className="pos-input mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  {translate("settingsMaxGuestsPerSlot")}
                </span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={draft.reservationMaxGuestsPerSlot}
                  onChange={(event) =>
                    updateDraft("reservationMaxGuestsPerSlot", Number(event.target.value))
                  }
                  className="pos-input mt-1"
                />
              </label>
            </div>

            <h3 className="mt-6 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {translate("settingsOperatingHours")}
            </h3>
            <div className="mt-3 space-y-2">
              {WEEKDAY_KEYS.map((day) => {
                const dayConfig = draft.reservationOperatingHours[day];
                return (
                  <div
                    key={day}
                    className="grid gap-2 rounded-lg border border-gray-100 px-3 py-3 dark:border-gray-700 sm:grid-cols-[1.2fr_auto_auto_auto]"
                  >
                    <div className="flex items-center justify-between gap-3 sm:justify-start">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {weekdayLabels[day]}
                      </span>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={dayConfig.enabled}
                          onChange={(event) =>
                            updateOperatingHours(day, { enabled: event.target.checked })
                          }
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        {translate("settingsDayEnabled")}
                      </label>
                    </div>
                    <label className="block text-xs">
                      <span className="text-gray-500 dark:text-gray-400">{translate("settingsOpenTime")}</span>
                      <input
                        type="time"
                        value={dayConfig.open}
                        disabled={!dayConfig.enabled}
                        onChange={(event) => updateOperatingHours(day, { open: event.target.value })}
                        className="pos-input mt-1 disabled:opacity-50"
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="text-gray-500 dark:text-gray-400">{translate("settingsCloseTime")}</span>
                      <input
                        type="time"
                        value={dayConfig.close}
                        disabled={!dayConfig.enabled}
                        onChange={(event) => updateOperatingHours(day, { close: event.target.value })}
                        className="pos-input mt-1 disabled:opacity-50"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
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

          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800 md:col-span-2">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{translate("settingsCustomerDisplay")}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{translate("settingsCustomerDisplayHint")}</p>

            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{translate("settingsCfdAdVideo")}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{translate("settingsCfdAdVideoHint")}</p>
                {settings.cfdAdVideoUrl ? (
                  isCfdGifMedia(settings.cfdAdVideoUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={settings.cfdAdVideoUrl}
                      alt="Promotional GIF preview"
                      className="mt-2 max-h-48 w-full rounded-lg border border-gray-200 bg-black object-contain dark:border-gray-700"
                    />
                  ) : (
                    <video
                      src={settings.cfdAdVideoUrl}
                      controls
                      muted
                      playsInline
                      className="mt-2 max-h-48 w-full rounded-lg border border-gray-200 bg-black dark:border-gray-700"
                    />
                  )
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{translate("settingsCfdNoVideo")}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => cfdVideoInputRef.current?.click()}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {translate("settingsCfdUploadVideo")}
                  </button>
                  {settings.cfdAdVideoUrl && (
                    <button
                      type="button"
                      onClick={() => void clearCfdVideo()}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-600"
                    >
                      {translate("settingsCfdRemoveVideo")}
                    </button>
                  )}
                  <input
                    ref={cfdVideoInputRef}
                    type="file"
                    accept=".mp4,.webm,.gif,video/mp4,video/webm,image/gif"
                    className="hidden"
                    onChange={(event) => void handleCfdVideoUpload(event)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{translate("settingsCfdReviewQr")}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{translate("settingsCfdReviewQrHint")}</p>
                {settings.cfdReviewQrImageUrl.trim() ? (
                  <div className="mt-2 inline-block rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={settings.cfdReviewQrImageUrl}
                      alt="Review QR"
                      width={160}
                      height={160}
                      className="h-40 w-40 object-contain"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-300">{translate("settingsCfdNoQr")}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => cfdQrInputRef.current?.click()}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {settings.cfdReviewQrImageUrl.trim()
                      ? translate("settingsCfdChangeQr")
                      : translate("settingsCfdUploadQr")}
                  </button>
                  {settings.cfdReviewQrImageUrl.trim() && (
                    <button
                      type="button"
                      onClick={() => void clearCfdQrImage()}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-600"
                    >
                      {translate("settingsCfdRemoveQr")}
                    </button>
                  )}
                  <input
                    ref={cfdQrInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => void handleCfdQrUpload(event)}
                  />
                </div>
              </div>
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
              EUR display is configured in Display &amp; currency above. USD remains a receipt-only option on this device.
            </p>
            <div className="mt-4 space-y-3">
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
            {receiptShowUsd && (
              <div className="mt-4">
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
            <h2 className="font-semibold text-amber-900 dark:text-amber-200">
              {translate("settingsAdminTerminal")}
            </h2>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
              {translate("settingsAdminTerminalHint")}
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-amber-900 dark:text-amber-200">
                  {translate("settingsAdminDeletionPassword")}
                </span>
                <input
                  type="password"
                  value={draft.adminDeletionPassword}
                  onChange={(event) => updateDraft("adminDeletionPassword", event.target.value)}
                  className="pos-input mt-1"
                  autoComplete="new-password"
                />
              </label>

              <label className="block text-sm sm:col-span-2">
                <span className="text-amber-900 dark:text-amber-200">
                  {translate("settingsTerminalMode")}
                </span>
                <select
                  value={draft.terminalType}
                  onChange={(event) =>
                    updateDraft(
                      "terminalType",
                      event.target.value as SettingsPageDraft["terminalType"],
                    )
                  }
                  className="pos-input mt-1"
                >
                  <option value="mock">{translate("settingsTerminalMock")}</option>
                  <option value="network">{translate("settingsTerminalNetwork")}</option>
                </select>
              </label>

              {draft.terminalType === "network" && (
                <>
                  <label className="block text-sm sm:col-span-2">
                    <span className="text-amber-900 dark:text-amber-200">
                      {translate("settingsTerminalConnectionMode")}
                    </span>
                    <select
                      value={draft.terminalConnectionMode}
                      onChange={(event) =>
                        updateDraft(
                          "terminalConnectionMode",
                          event.target.value as SettingsPageDraft["terminalConnectionMode"],
                        )
                      }
                      className="pos-input mt-1"
                    >
                      <option value="inbound">{translate("settingsTerminalInbound")}</option>
                      <option value="outbound">{translate("settingsTerminalOutbound")}</option>
                    </select>
                    <span className="mt-1 block text-xs text-amber-800 dark:text-amber-400">
                      {translate("settingsTerminalInboundHint")}
                    </span>
                  </label>
                  <label className="block text-sm">
                    <span className="text-amber-900 dark:text-amber-200">
                      {draft.terminalConnectionMode === "inbound"
                        ? translate("settingsTerminalPcIp")
                        : translate("settingsTerminalIp")}
                    </span>
                    {draft.terminalConnectionMode === "outbound" ? (
                      <input
                        type="text"
                        value={draft.terminalIp}
                        onChange={(event) => updateDraft("terminalIp", event.target.value)}
                        className="pos-input mt-1"
                        placeholder="192.168.1.105"
                      />
                    ) : (
                      <input
                        type="text"
                        value="192.168.1.43"
                        readOnly
                        className="pos-input mt-1 bg-amber-100/50 dark:bg-amber-950/20"
                      />
                    )}
                  </label>
                  <label className="block text-sm">
                    <span className="text-amber-900 dark:text-amber-200">
                      {draft.terminalConnectionMode === "inbound"
                        ? translate("settingsTerminalListenPort")
                        : translate("settingsTerminalPort")}
                    </span>
                    <input
                      type="text"
                      value={draft.terminalPort}
                      onChange={(event) => updateDraft("terminalPort", event.target.value)}
                      className="pos-input mt-1"
                      placeholder="2000"
                    />
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="text-amber-900 dark:text-amber-200">
                      {translate("settingsTerminalPosId")}
                    </span>
                    <input
                      type="text"
                      value={draft.terminalPosId}
                      onChange={(event) => updateDraft("terminalPosId", event.target.value)}
                      className="pos-input mt-1 font-mono uppercase"
                      placeholder="PVTL9664"
                      maxLength={16}
                    />
                    <span className="mt-1 block text-xs text-amber-800 dark:text-amber-400">
                      {translate("settingsTerminalPosIdHint")}
                    </span>
                  </label>
                </>
              )}

              <div className="sm:col-span-2">
                <button
                  type="button"
                  disabled={terminalTesting}
                  onClick={() => void handleTestTerminal()}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                >
                  <CreditCard className="h-4 w-4" />
                  {terminalTesting
                    ? translate("settingsTerminalTesting")
                    : translate("settingsTerminalTest")}
                </button>
                {terminalTestMessage && (
                  <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">{terminalTestMessage}</p>
                )}
              </div>
            </div>

            <p className="mt-4 text-xs text-amber-800 dark:text-amber-400">
              {translate("managerPin")}: Demo PIN <strong>1234</strong> — voids, discounts, manual card override.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
