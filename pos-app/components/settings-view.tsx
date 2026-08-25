"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LanguageSelector } from "@/components/language-selector";
import {
  clampKitchenClipTopMm,
  clampKitchenClipBottomMm,
  clampKitchenItemGapPx,
  KITCHEN_CLIP_TOP_MM_MAX,
  KITCHEN_CLIP_TOP_MM_MIN,
  KITCHEN_CLIP_BOTTOM_MM_MAX,
  KITCHEN_CLIP_BOTTOM_MM_MIN,
  KITCHEN_ITEM_GAP_PX_MAX,
  KITCHEN_ITEM_GAP_PX_MIN,
} from "@/lib/kitchen-print-layout";
import { KitchenPrintLayoutEditor } from "@/components/kitchen-print-layout-editor";
import { KitchenTicketSpacingPreview } from "@/components/kitchen-ticket-spacing-preview";
import { ReceiptBrandingEditor } from "@/components/receipt-branding-editor";
import { ReceiptPrintPreview } from "@/components/receipt-print-preview";
import { LiveClock } from "@/components/live-clock";
import { MenuCustomizationManager } from "@/components/menu-customization-manager";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useNotifications } from "@/contexts/notification-context";
import { useReceiptPrint } from "@/contexts/receipt-print-context";
import { useSettings } from "@/contexts/settings-context";
import { useRegisterUnsavedWork } from "@/contexts/unsaved-work-context";
import { playCustomAlertSound } from "@/lib/notification-sound";
import { buildSoundSelectOptions } from "@/lib/auto-serve";
import type { SoundConfigs } from "@/lib/types";
import {
  pickSettingsPageDraft,
  type SettingsPageDraft,
} from "@/src/lib/settings-actions";
import { WEEKDAY_KEYS } from "@/lib/reservation-slots";
import { buildTestReceiptData } from "@/lib/receipt-calculations";
import { RECEIPT_FONT_OPTIONS } from "@/lib/receipt-print-styles";
import { draftToReceiptTemplate } from "@/src/components/ReceiptPrint";
import { MarqueeSettingsEditor } from "@/components/marquee-settings-editor";
import type { TranslationKey } from "@/lib/i18n/translations";
import { pingPrintBridge } from "@/src/lib/print-bridge-client";
import type { NetworkPrinter, PrinterRole, ReceiptFontFamily, WeekdayKey } from "@/lib/types";
import { formatPrinterEndpoint } from "@/lib/print-dispatch";
import { CfdSlideshowManager } from "@/components/cfd-slideshow-manager";
import {
  clearBusinessLogoAction,
  uploadBusinessLogoAction,
} from "@/src/lib/business-auth-actions";
import { Monitor, Plus, Printer, Save, Tablet, Trash2, Tv } from "lucide-react";

const RECEIPT_FONT_LABEL_KEYS: Record<ReceiptFontFamily, TranslationKey> = {
  consolas: "settingsReceiptFontConsolas",
  courier: "settingsReceiptFontCourier",
  arial: "settingsReceiptFontArial",
  tahoma: "settingsReceiptFontTahoma",
  lucida: "settingsReceiptFontLucida",
  georgia: "settingsReceiptFontGeorgia",
};

type SettingsTabId =
  | "branding"
  | "printing"
  | "display"
  | "menu"
  | "marquee"
  | "reservations"
  | "sounds"
  | "cfd"
  | "devices"
  | "general"
  | "security";

export function SettingsView({
  menuItems = [],
  categories = [],
  onMenuChange,
}: {
  menuItems?: import("@/lib/types").MenuItem[];
  categories?: import("@/lib/types").MenuCategoryRecord[];
  onMenuChange?: () => void;
}) {
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
    notifyMainNewOrderEnabled,
    soundMainNewOrderEnabled,
    setSoundMainEnabled,
    setSoundKitchenEnabled,
    setNotifyMainNewOrderEnabled,
    setSoundMainNewOrderEnabled,
    currentStaffUser,
  } = useApp();
  const { settings, saving, error: settingsError, saveSettingsPageDraft, uploadEventAlertSound, uploadCfdReviewQrImage, saveSettings } =
    useSettings();
  const { business, updateBranding } = useAuth();
  const { pushNotification } = useNotifications();
  const { printTestReceipt, openReceiptPreview } = useReceiptPrint();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const cfdQrInputRef = useRef<HTMLInputElement>(null);
  const eventSoundInputRef = useRef<HTMLInputElement>(null);
  const [uploadSoundKey, setUploadSoundKey] = useState<keyof SoundConfigs | null>(null);

  const [draft, setDraft] = useState<SettingsPageDraft>(() => pickSettingsPageDraft(settings));
  const [dirty, setDirty] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [bridgeTestMessage, setBridgeTestMessage] = useState<string | null>(null);
  const [bridgeTesting, setBridgeTesting] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabId>("printing");

  const settingsTabs: { id: SettingsTabId; labelKey: TranslationKey }[] = [
    { id: "branding", labelKey: "settingsTabBranding" },
    { id: "printing", labelKey: "settingsTabPrinting" },
    { id: "display", labelKey: "settingsTabDisplay" },
    { id: "menu", labelKey: "settingsTabMenu" },
    { id: "marquee", labelKey: "settingsTabMarquee" },
    { id: "reservations", labelKey: "settingsTabReservations" },
    { id: "sounds", labelKey: "settingsTabSounds" },
    { id: "cfd", labelKey: "settingsTabCfd" },
    { id: "devices", labelKey: "settingsTabDevices" },
    { id: "general", labelKey: "settingsTabGeneral" },
    { id: "security", labelKey: "settingsTabSecurity" },
  ];

  const visibleSettingsTabs = settingsTabs.filter(
    (tab) => tab.id !== "security" || currentStaffUser?.role === "admin",
  );

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
    return ok;
  };

  useRegisterUnsavedWork({
    id: "settings-page",
    isDirty: () => dirty,
    onSave: useCallback(async () => {
      const ok = await saveSettingsPageDraft(draftRef.current);
      if (ok) {
        setDirty(false);
        pushNotification({
          id: "settings-saved",
          message: translate("settingsSavedSuccess"),
          playSound: false,
        });
      }
      return ok;
    }, [saveSettingsPageDraft, pushNotification, translate]),
  });

  const handleEventSoundUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const key = uploadSoundKey;
    event.target.value = "";
    setUploadSoundKey(null);
    if (!file || !key) return;

    const url = await uploadEventAlertSound(file);
    if (!url) return;

    const nextDraft: SettingsPageDraft = {
      ...draftRef.current,
      soundConfigs: { ...draftRef.current.soundConfigs, [key]: url },
    };
    setDraft(nextDraft);
    const ok = await saveSettingsPageDraft(nextDraft);
    if (ok) {
      setDirty(false);
      pushNotification({
        message: translate("settingsSavedSuccess"),
        playSound: false,
      });
    }
  };

  const soundExtraUrls = useMemo(() => {
    const urls = new Set<string>();
    if (settings.customAlertSoundUrl.trim()) urls.add(settings.customAlertSoundUrl.trim());
    for (const url of Object.values(draft.soundConfigs)) {
      if (url.trim()) urls.add(url.trim());
    }
    for (const url of Object.values(settings.soundConfigs)) {
      if (url.trim()) urls.add(url.trim());
    }
    return [...urls];
  }, [settings.customAlertSoundUrl, settings.soundConfigs, draft.soundConfigs]);

  const handleCfdQrUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadCfdReviewQrImage(file);
    event.target.value = "";
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

  const handleTestPrintBridge = async () => {
    setBridgeTesting(true);
    setBridgeTestMessage(null);
    const result = await pingPrintBridge(draft.printBridgeUrl);
    setBridgeTesting(false);
    setBridgeTestMessage(result.message);
  };

  const updatePrinter = (id: string, patch: Partial<NetworkPrinter>) => {
    updateDraft(
      "printers",
      draft.printers.map((printer) => (printer.id === id ? { ...printer, ...patch } : printer)),
    );
  };

  const togglePrinterRole = (id: string, role: PrinterRole) => {
    const printer = draft.printers.find((entry) => entry.id === id);
    if (!printer) return;
    const hasRole = printer.roles.includes(role);
    const roles = hasRole
      ? printer.roles.filter((entry) => entry !== role)
      : [...printer.roles, role];
    updatePrinter(id, { roles: roles.length > 0 ? roles : [role] });
  };

  const addPrinter = () => {
    const next: NetworkPrinter = {
      id: `printer-${Date.now()}`,
      name: `Printer ${draft.printers.length + 1}`,
      host: draft.printerIp || "192.168.1.200",
      port: draft.printerPort || "9100",
      enabled: true,
      roles: ["kitchen"],
      legacyBitmap: false,
    };
    updateDraft("printers", [...draft.printers, next]);
  };

  const removePrinter = (id: string) => {
    updateDraft(
      "printers",
      draft.printers.filter((printer) => printer.id !== id),
    );
  };

  const devices = [
    { href: "/", label: translate("posWindows"), icon: Monitor, desc: "Cashier & floor manager" },
    { href: "/server", label: translate("tabletServer"), icon: Tablet, desc: "Table ordering" },
    {
      href: "/print-station",
      label: translate("printStation"),
      icon: Printer,
      desc: translate("printStationDeviceHint"),
    },
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

      <div className="shrink-0 border-b border-gray-200 bg-white px-3 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
        <nav
          className="-mb-px flex gap-1 overflow-x-auto pb-px pt-1"
          aria-label={translate("settings")}
        >
          {visibleSettingsTabs.map((tab) => {
            const active = activeSettingsTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSettingsTab(tab.id)}
                className={`shrink-0 rounded-t-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-gray-50 text-emerald-700 ring-1 ring-inset ring-gray-200 dark:bg-gray-950 dark:text-emerald-400 dark:ring-gray-700"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                }`}
              >
                {translate(tab.labelKey)}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {settingsError && (
          <p className="mx-auto mb-4 max-w-5xl rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {settingsError}
          </p>
        )}

        {activeSettingsTab === "branding" && (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6">
          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-6">
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
        </div>
        )}

        {activeSettingsTab === "printing" && (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6">
          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-6">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{translate("settingsReceiptPrinting")}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{translate("settingsPrinterHint")}</p>

            <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
              <div className="min-w-0">
                <span className="block text-sm text-gray-800 dark:text-gray-200">
                  {translate("settingsSilentPrint")}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                  {translate("settingsSilentPrintHint")}
                </span>
              </div>
              <input
                type="checkbox"
                checked={draft.silentPrintEnabled}
                onChange={(event) => updateDraft("silentPrintEnabled", event.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-gray-300"
              />
            </label>

            {draft.silentPrintEnabled && (
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {translate("settingsPrintBridgeUrl")}
                  </span>
                  <input
                    value={draft.printBridgeUrl}
                    onChange={(event) => updateDraft("printBridgeUrl", event.target.value)}
                    className="pos-input mt-1"
                    placeholder="http://127.0.0.1:39100"
                  />
                  <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
                    {translate("settingsPrintBridgeUrlWarning")}
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={bridgeTesting}
                    onClick={() => void handleTestPrintBridge()}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-600"
                  >
                    {bridgeTesting
                      ? translate("settingsPrintBridgeTesting")
                      : translate("settingsPrintBridgeTest")}
                  </button>
                  {bridgeTestMessage && (
                    <span className="text-xs text-gray-600 dark:text-gray-300">{bridgeTestMessage}</span>
                  )}
                </div>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    {translate("settingsBrowserPrintFallback")}
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.browserPrintFallback}
                    onChange={(event) =>
                      updateDraft("browserPrintFallback", event.target.checked)
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </label>
              </div>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {translate("settingsPrinters")}
              </h3>
              <button
                type="button"
                onClick={addPrinter}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold dark:border-gray-600"
              >
                <Plus className="h-3.5 w-3.5" />
                {translate("settingsPrinterAdd")}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {translate("settingsPrintersHint")}
            </p>

            <div className="mt-3 space-y-3">
              {draft.printers.map((printer) => (
                <div
                  key={printer.id}
                  className="rounded-xl border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <input
                        type="checkbox"
                        checked={printer.enabled}
                        onChange={(event) =>
                          updatePrinter(printer.id, { enabled: event.target.checked })
                        }
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {translate("settingsPrinterEnabled")}
                    </label>
                    <button
                      type="button"
                      onClick={() => removePrinter(printer.id)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {translate("settingsPrinterRemove")}
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {translate("settingsPrinterName")}
                      </span>
                      <input
                        value={printer.name}
                        onChange={(event) =>
                          updatePrinter(printer.id, { name: event.target.value })
                        }
                        className="pos-input mt-1"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {translate("settingsPrinterIp")}
                      </span>
                      <input
                        value={printer.host}
                        onChange={(event) =>
                          updatePrinter(printer.id, { host: event.target.value })
                        }
                        className="pos-input mt-1"
                        placeholder="192.168.1.200"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {translate("settingsPrinterPort")}
                      </span>
                      <input
                        value={printer.port}
                        onChange={(event) =>
                          updatePrinter(printer.id, { port: event.target.value })
                        }
                        className="pos-input mt-1"
                        placeholder="9100"
                      />
                    </label>
                    <div className="block text-sm sm:col-span-2">
                      <span className="text-gray-500 dark:text-gray-400">
                        {translate("settingsPrinterRoles")}
                      </span>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {(
                          ["receipt", "kitchen", "kitchen-message", "bar"] as PrinterRole[]
                        ).map((role) => (
                          <label key={role} className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={printer.roles.includes(role)}
                              onChange={() => togglePrinterRole(printer.id, role)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            {role === "receipt"
                              ? translate("settingsPrinterRoleReceipt")
                              : role === "kitchen"
                                ? translate("settingsPrinterRoleKitchen")
                                : role === "kitchen-message"
                                  ? translate("settingsPrinterRoleKitchenMessage")
                                  : translate("settingsPrinterRoleBar")}
                          </label>
                        ))}
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 sm:col-span-2 dark:border-amber-900/50 dark:bg-amber-950/20">
                      <input
                        type="checkbox"
                        checked={printer.legacyBitmap === true}
                        onChange={(event) =>
                          updatePrinter(printer.id, { legacyBitmap: event.target.checked })
                        }
                        className="mt-0.5 h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-sm">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {translate("settingsPrinterLegacyBitmap")} — {formatPrinterEndpoint(printer)}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                          {translate("settingsPrinterLegacyBitmapHint")}
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
              <div>
                <span className="text-sm text-gray-800 dark:text-gray-200">{translate("settingsAutoPrint")}</span>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {translate("settingsAutoPrintHint")}
                </p>
              </div>
              <input
                type="checkbox"
                checked={draft.autoPrintOnPayment}
                onChange={(event) => updateDraft("autoPrintOnPayment", event.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
            </label>

            <div className="mt-4 rounded-lg border border-gray-100 p-4 dark:border-gray-700">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {translate("settingsFulfillmentMode")}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {translate("settingsFulfillmentModeHint")}
              </p>
              <div className="mt-3 space-y-2">
                {(
                  [
                    ["both", "settingsFulfillmentModeBoth"],
                    ["screen", "settingsFulfillmentModeScreen"],
                    ["paper", "settingsFulfillmentModePaper"],
                  ] as const
                ).map(([value, labelKey]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${
                      draft.kitchenFulfillmentMode === value
                        ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="kitchenFulfillmentMode"
                      checked={draft.kitchenFulfillmentMode === value}
                      onChange={() => updateDraft("kitchenFulfillmentMode", value)}
                      className="mt-1"
                    />
                    <span className="text-sm text-gray-800 dark:text-gray-200">
                      {translate(labelKey)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {draft.kitchenFulfillmentMode === "both" && (
              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                <div className="min-w-0">
                  <span className="block text-sm text-gray-800 dark:text-gray-200">
                    {translate("settingsKitchenPrint")}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                    {translate("settingsKitchenPrintHint")}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={draft.kitchenPrintEnabled}
                  onChange={(event) => updateDraft("kitchenPrintEnabled", event.target.checked)}
                  className="h-4 w-4 shrink-0 rounded border-gray-300"
                />
              </label>
            )}

            {draft.kitchenFulfillmentMode === "screen" && (
              <p className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                {translate("settingsFulfillmentModeScreenNote")}
              </p>
            )}

            {draft.kitchenFulfillmentMode === "paper" && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                {translate("settingsFulfillmentModePaperNote")}
              </p>
            )}

            {((draft.kitchenFulfillmentMode === "both" && draft.kitchenPrintEnabled) ||
              draft.kitchenFulfillmentMode === "paper") && (
              <div className="mt-3 space-y-3">
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                  <div className="min-w-0">
                    <span className="block text-sm text-gray-800 dark:text-gray-200">
                      {translate("settingsKitchenPrintViaStation")}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                      {translate("settingsKitchenPrintViaStationHint")}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={draft.kitchenPrintViaStation}
                    onChange={(event) =>
                      updateDraft("kitchenPrintViaStation", event.target.checked)
                    }
                    className="h-4 w-4 shrink-0 rounded border-gray-300"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {translate("settingsKitchenPrintPrimary")}
                  </span>
                  <select
                    value={draft.kitchenPrintPrimaryLang}
                    onChange={(event) =>
                      updateDraft(
                        "kitchenPrintPrimaryLang",
                        event.target.value as SettingsPageDraft["kitchenPrintPrimaryLang"],
                      )
                    }
                    className="pos-input mt-1"
                  >
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                    <option value="cs">Čeština</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {translate("settingsKitchenPrintSecondary")}
                  </span>
                  <select
                    value={draft.kitchenPrintSecondaryLang}
                    onChange={(event) =>
                      updateDraft(
                        "kitchenPrintSecondaryLang",
                        event.target.value as SettingsPageDraft["kitchenPrintSecondaryLang"],
                      )
                    }
                    className="pos-input mt-1"
                  >
                    <option value="en">English</option>
                    <option value="zh">中文</option>
                    <option value="cs">Čeština</option>
                    <option value="none">{translate("settingsKitchenPrintLangNone")}</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {translate("settingsKitchenPrintOrderFontSize")}
                  </span>
                  <select
                    value={draft.kitchenPrintOrderFontSize}
                    onChange={(event) =>
                      updateDraft(
                        "kitchenPrintOrderFontSize",
                        event.target.value as SettingsPageDraft["kitchenPrintOrderFontSize"],
                      )
                    }
                    className="pos-input mt-1"
                  >
                    <option value="large">{translate("settingsKitchenPrintFontLarge")}</option>
                    <option value="xlarge">{translate("settingsKitchenPrintFontXLarge")}</option>
                    <option value="xxlarge">{translate("settingsKitchenPrintFontXXLarge")}</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {translate("settingsKitchenPrintMessageFontSize")}
                  </span>
                  <select
                    value={draft.kitchenPrintMessageFontSize}
                    onChange={(event) =>
                      updateDraft(
                        "kitchenPrintMessageFontSize",
                        event.target.value as SettingsPageDraft["kitchenPrintMessageFontSize"],
                      )
                    }
                    className="pos-input mt-1"
                  >
                    <option value="large">{translate("settingsKitchenPrintFontLarge")}</option>
                    <option value="xlarge">{translate("settingsKitchenPrintFontXLarge")}</option>
                    <option value="xxlarge">{translate("settingsKitchenPrintFontXXLarge")}</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {translate("settingsKitchenPrintClipTop")}
                  </span>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="range"
                      min={KITCHEN_CLIP_TOP_MM_MIN}
                      max={KITCHEN_CLIP_TOP_MM_MAX}
                      step={1}
                      value={draft.kitchenPrintClipTopMm}
                      onChange={(event) =>
                        updateDraft(
                          "kitchenPrintClipTopMm",
                          clampKitchenClipTopMm(Number(event.target.value)),
                        )
                      }
                      className="min-h-[44px] flex-1"
                    />
                    <span className="w-14 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                      {draft.kitchenPrintClipTopMm} mm
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {translate("settingsKitchenPrintClipTopHint")}
                  </p>
                </label>
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {translate("settingsKitchenPrintClipBottom")}
                  </span>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="range"
                      min={KITCHEN_CLIP_BOTTOM_MM_MIN}
                      max={KITCHEN_CLIP_BOTTOM_MM_MAX}
                      step={1}
                      value={draft.kitchenPrintClipBottomMm}
                      onChange={(event) =>
                        updateDraft(
                          "kitchenPrintClipBottomMm",
                          clampKitchenClipBottomMm(Number(event.target.value)),
                        )
                      }
                      className="min-h-[44px] flex-1"
                    />
                    <span className="w-14 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                      {draft.kitchenPrintClipBottomMm} mm
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {translate("settingsKitchenPrintClipBottomHint")}
                  </p>
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="text-gray-500 dark:text-gray-400">
                    {translate("settingsKitchenPrintItemGap")}
                  </span>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="range"
                      min={KITCHEN_ITEM_GAP_PX_MIN}
                      max={KITCHEN_ITEM_GAP_PX_MAX}
                      step={2}
                      value={draft.kitchenPrintItemGapPx}
                      onChange={(event) =>
                        updateDraft(
                          "kitchenPrintItemGapPx",
                          clampKitchenItemGapPx(Number(event.target.value)),
                        )
                      }
                      className="min-h-[44px] flex-1"
                    />
                    <span className="w-14 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                      {draft.kitchenPrintItemGapPx} px
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {translate("settingsKitchenPrintItemGapHint")}
                  </p>
                  <KitchenTicketSpacingPreview
                    itemGapPx={draft.kitchenPrintItemGapPx}
                    clipTopMm={draft.kitchenPrintClipTopMm}
                    clipBottomMm={draft.kitchenPrintClipBottomMm}
                    fontSize={draft.kitchenPrintOrderFontSize}
                    fontWeight={draft.kitchenPrintOrderFontWeight}
                    layout={draft.kitchenPrintLayout}
                    primaryLang={draft.kitchenPrintPrimaryLang}
                    secondaryLang={draft.kitchenPrintSecondaryLang}
                    translate={translate}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {translate("settingsKitchenPrintOrderFontWeight")}
                  </span>
                  <select
                    value={draft.kitchenPrintOrderFontWeight}
                    onChange={(event) =>
                      updateDraft(
                        "kitchenPrintOrderFontWeight",
                        event.target.value as SettingsPageDraft["kitchenPrintOrderFontWeight"],
                      )
                    }
                    className="pos-input mt-1"
                  >
                    <option value="normal">{translate("settingsReceiptWeightNormal")}</option>
                    <option value="bold">{translate("settingsReceiptWeightBold")}</option>
                    <option value="extrabold">{translate("settingsReceiptWeightExtraBold")}</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {translate("settingsKitchenPrintMessageFontWeight")}
                  </span>
                  <select
                    value={draft.kitchenPrintMessageFontWeight}
                    onChange={(event) =>
                      updateDraft(
                        "kitchenPrintMessageFontWeight",
                        event.target.value as SettingsPageDraft["kitchenPrintMessageFontWeight"],
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
                <KitchenPrintLayoutEditor
                  layout={draft.kitchenPrintLayout}
                  onChange={(layout) => updateDraft("kitchenPrintLayout", layout)}
                  translate={translate}
                />
              </div>
            )}

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
              {translate("settingsBranding")}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {translate("settingsBrandingHint")}
            </p>
            <ReceiptBrandingEditor
              draft={{
                ...draft.receiptBrandingVisibility,
                receiptHeaderTitle: draft.receiptHeaderTitle,
                receiptLegalName: draft.receiptLegalName,
                receiptAddress: draft.receiptAddress,
                receiptCompanyAddress: draft.receiptCompanyAddress,
                receiptIco: draft.receiptIco,
                receiptDic: draft.receiptDic,
                receiptPhone: draft.receiptPhone,
                receiptFooterNote: draft.receiptFooterNote,
              }}
              translate={translate}
              onChange={(patch) => {
                const visibilityKeys = [
                  "showHeaderTitle",
                  "showBrandAddress",
                  "showLegalName",
                  "showCompanyAddress",
                  "showIcoDic",
                  "showPhone",
                  "showFooter",
                ] as const;
                const visPatch: Partial<typeof draft.receiptBrandingVisibility> = {};
                for (const key of visibilityKeys) {
                  if (key in patch) {
                    visPatch[key] = patch[key] as boolean;
                  }
                }
                if (Object.keys(visPatch).length > 0) {
                  updateDraft("receiptBrandingVisibility", {
                    ...draft.receiptBrandingVisibility,
                    ...visPatch,
                  });
                }
                if (patch.receiptHeaderTitle !== undefined) {
                  updateDraft("receiptHeaderTitle", patch.receiptHeaderTitle);
                }
                if (patch.receiptLegalName !== undefined) {
                  updateDraft("receiptLegalName", patch.receiptLegalName);
                }
                if (patch.receiptAddress !== undefined) {
                  updateDraft("receiptAddress", patch.receiptAddress);
                }
                if (patch.receiptCompanyAddress !== undefined) {
                  updateDraft("receiptCompanyAddress", patch.receiptCompanyAddress);
                }
                if (patch.receiptIco !== undefined) updateDraft("receiptIco", patch.receiptIco);
                if (patch.receiptDic !== undefined) updateDraft("receiptDic", patch.receiptDic);
                if (patch.receiptPhone !== undefined) updateDraft("receiptPhone", patch.receiptPhone);
                if (patch.receiptFooterNote !== undefined) {
                  updateDraft("receiptFooterNote", patch.receiptFooterNote);
                }
              }}
            />

            <ReceiptPrintPreview
              draft={draft}
              translate={translate}
              onOpenFullPreview={() => {
                const previewTemplate = draftToReceiptTemplate(draft);
                openReceiptPreview(
                  buildTestReceiptData({
                    brandName: previewTemplate.brandName,
                    brandAddress: previewTemplate.brandAddress,
                    legalName: previewTemplate.legalName,
                    companyAddress: previewTemplate.companyAddress,
                    ico: previewTemplate.ico,
                    dic: previewTemplate.dic,
                    phone: previewTemplate.phone,
                    footerLines: previewTemplate.footerLines,
                  }),
                  {
                    template: previewTemplate,
                    font: {
                      receiptFontFamily: draft.receiptFontFamily,
                      receiptFontSize: draft.receiptFontSize,
                      receiptFontWeight: draft.receiptFontWeight,
                    },
                  },
                );
              }}
              onTestPrint={printTestReceipt}
            />
          </section>

        </div>
        )}

        {activeSettingsTab === "display" && (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6">
          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-6">
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
              {draft.showEurCurrency && (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                  <div>
                    <span className="text-sm text-gray-800 dark:text-gray-200">
                      {translate("settingsShowEurOnMenu")}
                    </span>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {translate("settingsShowEurOnMenuHint")}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={draft.showEurOnMenu}
                    onChange={(event) => updateDraft("showEurOnMenu", event.target.checked)}
                    className="h-4 w-4 shrink-0 rounded border-gray-300"
                  />
                </label>
              )}
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

          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-6">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{translate("receiptCurrency")}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {translate("settingsReceiptCurrencyHint")}
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
        </div>
        )}

        {activeSettingsTab === "menu" && (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6">
          <MenuCustomizationManager
            menuItems={menuItems}
            categories={categories}
            onChange={() => onMenuChange?.()}
          />
        </div>
        )}

        {activeSettingsTab === "marquee" && (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6">
          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-6">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {translate("settingsMarquee")}
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {translate("settingsMarqueeHint")}
            </p>

            <div className="mt-4">
              <MarqueeSettingsEditor
                value={draft.marqueeConfigs}
                onChange={(next) => updateDraft("marqueeConfigs", next)}
              />
            </div>
          </section>

        </div>
        )}

        {activeSettingsTab === "reservations" && (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6">
          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-6">
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
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  {translate("settingsMapResTickerSeconds")}
                </span>
                <input
                  type="number"
                  min={2}
                  max={30}
                  step={1}
                  value={draft.mapReservationTickerSeconds}
                  onChange={(event) =>
                    updateDraft(
                      "mapReservationTickerSeconds",
                      Math.min(30, Math.max(2, Number(event.target.value) || 6)),
                    )
                  }
                  className="pos-input mt-1"
                />
                <span className="mt-1 block text-[11px] text-gray-400 dark:text-gray-500">
                  {translate("settingsMapResTickerSecondsHint")}
                </span>
              </label>
            </div>

            <h3 className="mt-6 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {translate("settingsResReminderLeads")}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {translate("settingsResReminderLeadsHint")}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {(
                [
                  { value: "15" as const, labelKey: "settingsResReminder15" as const },
                  { value: "30" as const, labelKey: "settingsResReminder30" as const },
                  { value: "both" as const, labelKey: "settingsResReminderBoth" as const },
                ] as const
              ).map((option) => {
                const selected = draft.reservationReminderMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateDraft("reservationReminderMode", option.value)}
                    className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${
                      selected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100"
                        : "border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    }`}
                  >
                    {translate(option.labelKey)}
                  </button>
                );
              })}
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

        </div>
        )}

        {activeSettingsTab === "sounds" && (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800 md:col-span-2">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {translate("soundSettingsTitle")}
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {translate("soundSettingsHint")}
            </p>
            <input
              ref={eventSoundInputRef}
              type="file"
              accept=".mp3,.wav,audio/mpeg,audio/wav"
              className="hidden"
              onChange={(event) => void handleEventSoundUpload(event)}
            />
            <div className="mt-4 space-y-3">
              {(
                [
                  {
                    key: "callWaiter" as const,
                    label: translate("soundCallWaiter"),
                    testVariant: "newOrder" as const,
                  },
                  {
                    key: "mainNewOrder" as const,
                    label: translate("soundMainNewOrder"),
                    testVariant: "newOrder" as const,
                  },
                  {
                    key: "newOrder" as const,
                    label: translate("soundNewOrder"),
                    testVariant: "newOrder" as const,
                  },
                  {
                    key: "itemReady" as const,
                    label: translate("soundItemReady"),
                    testVariant: "ready" as const,
                  },
                  {
                    key: "paymentSuccess" as const,
                    label: translate("soundPaymentSuccess"),
                    testVariant: "ready" as const,
                  },
                  {
                    key: "reservationReminder" as const,
                    label: translate("soundReservationReminder"),
                    testVariant: "newOrder" as const,
                  },
                ] as const
              ).map((row) => {
                const currentValue =
                  draft.soundConfigs[row.key] ?? settings.soundConfigs[row.key] ?? "";
                const options = buildSoundSelectOptions(currentValue, soundExtraUrls);

                return (
                  <label key={row.key} className="block text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{row.label}</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <select
                        value={currentValue}
                        onChange={(event) =>
                          updateDraft("soundConfigs", {
                            ...draft.soundConfigs,
                            [row.key]: event.target.value,
                          })
                        }
                        className="pos-input min-w-0 flex-1"
                      >
                        {options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          playCustomAlertSound(currentValue, row.testVariant)
                        }
                        className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold dark:border-gray-600"
                      >
                        {translate("settingsPlayTestSound")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadSoundKey(row.key);
                          eventSoundInputRef.current?.click();
                        }}
                        className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                      >
                        {translate("settingsUploadSound")}
                      </button>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {translate("soundNotifications")}
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {translate("soundDeviceHint")}
            </p>
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Main POS
              </p>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                <span className="text-sm text-gray-800 dark:text-gray-200">{translate("soundMainNewOrderNotify")}</span>
                <input
                  type="checkbox"
                  checked={notifyMainNewOrderEnabled}
                  onChange={(event) => setNotifyMainNewOrderEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                <span className="text-sm text-gray-800 dark:text-gray-200">{translate("soundMainNewOrderBell")}</span>
                <input
                  type="checkbox"
                  checked={soundMainNewOrderEnabled}
                  onChange={(event) => setSoundMainNewOrderEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
                <span className="text-sm text-gray-800 dark:text-gray-200">{translate("soundMainPos")}</span>
                <input
                  type="checkbox"
                  checked={soundMainEnabled}
                  onChange={(event) => setSoundMainEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </label>
              <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Kitchen / Bar
              </p>
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
        </div>
        )}

        {activeSettingsTab === "cfd" && (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6">
          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{translate("settingsCustomerDisplay")}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{translate("settingsCustomerDisplayHint")}</p>

            <div className="mt-6 space-y-3">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{translate("settingsCfdAdVideo")}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{translate("settingsCfdAdVideoHint")}</p>
              <CfdSlideshowManager embedded />
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
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
          </section>
        </div>
        )}

        {activeSettingsTab === "devices" && (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6">
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
        </div>
        )}

        {activeSettingsTab === "general" && (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{translate("language")}</h2>
            <LanguageSelector variant="flag-menu" className="mt-3" />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{translate("settingsTabTheme")}</h2>
            <button
              type="button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="mt-3 pos-filter-btn-active px-4 py-2"
            >
              {theme === "light" ? translate("darkMode") : translate("lightMode")}
            </button>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 md:col-span-2 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {translate("settingsAutoSyncTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              {translate("settingsAutoSyncHint")}
            </p>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 md:col-span-2 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                  {translate("settingsChangelogPopup")}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {translate("settingsChangelogPopupHint")}
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                <input
                  type="checkbox"
                  checked={draft.changelogPopupEnabled}
                  onChange={(event) => updateDraft("changelogPopupEnabled", event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {translate("settingsChangelogPopupEnabled")}
                </span>
              </label>
            </div>

            <div className="mt-4 grid gap-4">
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  {translate("settingsChangelogPopupTitle")}
                </span>
                <input
                  type="text"
                  value={draft.changelogPopupTitle}
                  onChange={(event) => updateDraft("changelogPopupTitle", event.target.value)}
                  className="pos-input mt-1"
                  placeholder={translate("changelogPopupDefaultTitle")}
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  {translate("settingsChangelogPopupBody")}
                </span>
                <textarea
                  value={draft.changelogPopupBody}
                  onChange={(event) => updateDraft("changelogPopupBody", event.target.value)}
                  rows={8}
                  className="pos-input mt-1 min-h-[160px] resize-y font-mono text-sm"
                  placeholder={translate("settingsChangelogPopupBodyPlaceholder")}
                />
                <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                  {translate("settingsChangelogPopupBodyHint")}
                </span>
              </label>
            </div>
          </section>
        </div>
        )}

        {activeSettingsTab === "security" && (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6">
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30 sm:p-6">
            <h2 className="font-semibold text-amber-900 dark:text-amber-200">
              {translate("settingsAdminSecurity")}
            </h2>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
              {translate("settingsAdminSecurityHint")}
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
            </div>

            <p className="mt-4 text-xs text-amber-800 dark:text-amber-400">
              {translate("settingsManagerPasscodeHint")}
            </p>
          </section>
        </div>
        )}
      </div>
    </div>
  );
}
