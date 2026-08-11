import type {
  AppSettings,
  KitchenPrintFontSize,
  KitchenPrintLanguage,
  MenuItemLayout,
  NetworkPrinter,
  PrinterRole,
  ReservationOperatingHours,
  SoundConfigs,
} from "@/lib/types";
import { DEFAULT_SOUND_CONFIGS, parseSoundConfigs, soundConfigsToDb } from "@/lib/auto-serve";
import { DEFAULT_RESERVATION_OPERATING_HOURS } from "@/lib/reservation-slots";
import {
  clampMarqueeDurationSeconds,
  parseMarqueeFontFamily,
} from "@/lib/marquee-settings";
import {
  parseReceiptFontFamily,
  parseReceiptFontSize,
  parseReceiptFontWeight,
} from "@/lib/receipt-print-styles";
import { supabase } from "@/src/lib/supabase";

export function createDefaultPrinters(host = "192.168.1.200", port = "9100"): NetworkPrinter[] {
  return [
    {
      id: "printer-receipt",
      name: "Receipt",
      host,
      port,
      enabled: true,
      roles: ["receipt"],
    },
    {
      id: "printer-kitchen",
      name: "Kitchen",
      host,
      port,
      enabled: true,
      roles: ["kitchen", "kitchen-message"],
    },
    {
      id: "printer-bar",
      name: "Bar",
      host,
      port,
      enabled: true,
      roles: ["bar"],
    },
  ];
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  printerIp: "192.168.1.200",
  printerPort: "9100",
  silentPrintEnabled: false,
  printBridgeUrl: "http://127.0.0.1:39100",
  browserPrintFallback: true,
  printers: createDefaultPrinters(),
  autoPrintOnPayment: true,
  kitchenPrintEnabled: true,
  kitchenPrintViaStation: true,
  kitchenPrintPrimaryLang: "zh",
  kitchenPrintSecondaryLang: "en",
  kitchenPrintOrderFontSize: "xlarge",
  kitchenPrintMessageFontSize: "xlarge",
  receiptHeaderTitle: "JIN CHENG",
  receiptLegalName: "JING DE INTER.TRADE, s.r.o.",
  receiptAddress: "Václavské nám. 819, 110 00 Praha",
  receiptCompanyAddress: "Václavské náměstí 819/43, 110 00 Praha",
  receiptIco: "25682199",
  receiptDic: "CZ25682199",
  receiptPhone: "+420 222 240 429",
  receiptFooterNote: "Děkujeme za Vaši návštěvu!\nOtevírací doba: Po-Ne 10:00-22:00",
  customAlertSoundUrl: "/sounds/default-bell.mp3",
  soundConfigs: { ...DEFAULT_SOUND_CONFIGS },
  showPricesOnOrderScreen: true,
  menuItemLayout: "vertical",
  enablePriceRounding: true,
  showEurCurrency: false,
  eurExchangeRate: 25,
  reservationTimeStep: 30,
  reservationMaxGuestsPerSlot: 20,
  reservationTableHoldingTime: 90,
  reservationOperatingHours: DEFAULT_RESERVATION_OPERATING_HOURS,
  receiptFontSize: "medium",
  receiptFontWeight: "bold",
  receiptFontFamily: "consolas",
  adminDeletionPassword: "1234",
  cfdAdVideoUrl: "",
  cfdReviewUrl:
    "https://www.google.com/maps/search/?api=1&query=Seoul+Prague+Restaurant",
  cfdReviewQrImageUrl: "",
  marqueeEnabled: false,
  marqueeText: "",
  marqueeDurationSeconds: 28,
  marqueeFontFamily: "arial",
  marqueeEndAt: "",
  marqueeOnPos: true,
  marqueeOnClient: false,
  marqueeOnKds: false,
  marqueeOnBar: false,
};

type SettingsRow = {
  printer_ip: string;
  printer_port: string;
  silent_print_enabled?: boolean | null;
  print_bridge_url?: string | null;
  browser_print_fallback?: boolean | null;
  printers?: NetworkPrinter[] | unknown | null;
  auto_print_on_payment: boolean;
  kitchen_print_enabled?: boolean | null;
  kitchen_print_via_station?: boolean | null;
  kitchen_print_primary_lang?: string | null;
  kitchen_print_secondary_lang?: string | null;
  kitchen_print_order_font_size?: string | null;
  kitchen_print_message_font_size?: string | null;
  receipt_header_title: string;
  receipt_legal_name?: string | null;
  receipt_address: string;
  receipt_company_address?: string | null;
  receipt_ico?: string | null;
  receipt_dic?: string | null;
  receipt_phone: string;
  receipt_tax_id?: string | null;
  receipt_footer_note: string;
  custom_alert_sound_url: string;
  sound_configs?: SoundConfigs | Record<string, string> | null;
  show_prices_on_order_screen?: boolean | null;
  menu_item_layout?: string | null;
  enable_price_rounding?: boolean | null;
  show_eur_currency?: boolean | null;
  eur_exchange_rate?: number | string | null;
  reservation_time_step?: number | null;
  reservation_max_guests_per_slot?: number | null;
  reservation_table_holding_time?: number | null;
  reservation_operating_hours?: ReservationOperatingHours | null;
  receipt_font_size?: string | null;
  receipt_font_weight?: string | null;
  receipt_font_family?: string | null;
  admin_deletion_password?: string | null;
  cfd_ad_video_url?: string | null;
  cfd_review_url?: string | null;
  cfd_review_qr_image_url?: string | null;
  marquee_enabled?: boolean | null;
  marquee_text?: string | null;
  marquee_duration_seconds?: number | null;
  marquee_font_family?: string | null;
  marquee_end_at?: string | null;
  marquee_on_pos?: boolean | null;
  marquee_on_client?: boolean | null;
  marquee_on_kds?: boolean | null;
  marquee_on_bar?: boolean | null;
};

function parseNumericSetting(value: number | string | null | undefined, fallback: number): number {
  if (value == null) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOperatingHours(
  value: ReservationOperatingHours | null | undefined,
): ReservationOperatingHours {
  if (!value || typeof value !== "object") {
    return DEFAULT_RESERVATION_OPERATING_HOURS;
  }

  const merged = { ...DEFAULT_RESERVATION_OPERATING_HOURS };
  for (const key of Object.keys(DEFAULT_RESERVATION_OPERATING_HOURS) as (keyof ReservationOperatingHours)[]) {
    const day = value[key];
    if (day && typeof day === "object") {
      merged[key] = {
        enabled: day.enabled ?? merged[key].enabled,
        open: day.open ?? merged[key].open,
        close: day.close ?? merged[key].close,
      };
    }
  }
  return merged;
}

function parseMenuItemLayout(value: string | null | undefined): MenuItemLayout {
  return value === "horizontal" ? "horizontal" : "vertical";
}

function parsePrinterRole(value: unknown): PrinterRole | null {
  return value === "receipt" ||
    value === "kitchen" ||
    value === "kitchen-message" ||
    value === "bar"
    ? value
    : null;
}

function parseNetworkPrinter(value: unknown): NetworkPrinter | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : null;
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
  const host = typeof row.host === "string" && row.host.trim() ? row.host.trim() : null;
  if (!id || !name || !host) return null;
  const roles = Array.isArray(row.roles)
    ? row.roles.map(parsePrinterRole).filter((role): role is PrinterRole => Boolean(role))
    : [];
  return {
    id,
    name,
    host,
    port: typeof row.port === "string" && row.port.trim() ? row.port.trim() : "9100",
    enabled: row.enabled !== false,
    roles: roles.length > 0 ? roles : ["receipt"],
  };
}

function parsePrinters(
  value: unknown,
  fallbackHost: string,
  fallbackPort: string,
): NetworkPrinter[] {
  if (Array.isArray(value)) {
    const parsed = value
      .map(parseNetworkPrinter)
      .filter((printer): printer is NetworkPrinter => Boolean(printer));
    if (parsed.length > 0) return parsed;
  }
  return createDefaultPrinters(fallbackHost || "192.168.1.200", fallbackPort || "9100");
}

function parseKitchenPrintPrimary(value: string | null | undefined): KitchenPrintLanguage {
  if (value === "en" || value === "cs" || value === "zh") return value;
  return DEFAULT_APP_SETTINGS.kitchenPrintPrimaryLang;
}

function parseKitchenPrintSecondary(
  value: string | null | undefined,
): KitchenPrintLanguage | "none" {
  if (value === "none" || value === "en" || value === "cs" || value === "zh") return value;
  return DEFAULT_APP_SETTINGS.kitchenPrintSecondaryLang;
}

function parseKitchenPrintFontSize(value: string | null | undefined): KitchenPrintFontSize {
  if (value === "large" || value === "xlarge" || value === "xxlarge") return value;
  // Legacy "normal" was smaller than Large — bump to minimum Large.
  if (value === "normal") return "large";
  return DEFAULT_APP_SETTINGS.kitchenPrintOrderFontSize;
}

function mapSettingsRow(row: SettingsRow): AppSettings {
  const printerIp = row.printer_ip || DEFAULT_APP_SETTINGS.printerIp;
  const printerPort = row.printer_port || DEFAULT_APP_SETTINGS.printerPort;
  return {
    printerIp,
    printerPort,
    silentPrintEnabled: row.silent_print_enabled ?? DEFAULT_APP_SETTINGS.silentPrintEnabled,
    printBridgeUrl: row.print_bridge_url?.trim() || DEFAULT_APP_SETTINGS.printBridgeUrl,
    browserPrintFallback:
      row.browser_print_fallback ?? DEFAULT_APP_SETTINGS.browserPrintFallback,
    printers: parsePrinters(row.printers, printerIp, printerPort),
    autoPrintOnPayment: row.auto_print_on_payment,
    kitchenPrintEnabled: row.kitchen_print_enabled ?? DEFAULT_APP_SETTINGS.kitchenPrintEnabled,
    kitchenPrintViaStation:
      row.kitchen_print_via_station ?? DEFAULT_APP_SETTINGS.kitchenPrintViaStation,
    kitchenPrintPrimaryLang: parseKitchenPrintPrimary(row.kitchen_print_primary_lang),
    kitchenPrintSecondaryLang: parseKitchenPrintSecondary(row.kitchen_print_secondary_lang),
    kitchenPrintOrderFontSize: parseKitchenPrintFontSize(row.kitchen_print_order_font_size),
    kitchenPrintMessageFontSize: parseKitchenPrintFontSize(
      row.kitchen_print_message_font_size ?? row.kitchen_print_order_font_size,
    ),
    receiptHeaderTitle: row.receipt_header_title,
    receiptLegalName: row.receipt_legal_name ?? DEFAULT_APP_SETTINGS.receiptLegalName,
    receiptAddress: row.receipt_address,
    receiptCompanyAddress: row.receipt_company_address ?? DEFAULT_APP_SETTINGS.receiptCompanyAddress,
    receiptIco: row.receipt_ico ?? DEFAULT_APP_SETTINGS.receiptIco,
    receiptDic: row.receipt_dic ?? row.receipt_tax_id ?? DEFAULT_APP_SETTINGS.receiptDic,
    receiptPhone: row.receipt_phone,
    receiptFooterNote: row.receipt_footer_note,
    customAlertSoundUrl: row.custom_alert_sound_url,
    soundConfigs: parseSoundConfigs(row.sound_configs),
    showPricesOnOrderScreen: row.show_prices_on_order_screen ?? DEFAULT_APP_SETTINGS.showPricesOnOrderScreen,
    menuItemLayout: parseMenuItemLayout(row.menu_item_layout),
    enablePriceRounding: row.enable_price_rounding ?? DEFAULT_APP_SETTINGS.enablePriceRounding,
    showEurCurrency: row.show_eur_currency ?? DEFAULT_APP_SETTINGS.showEurCurrency,
    eurExchangeRate: parseNumericSetting(row.eur_exchange_rate, DEFAULT_APP_SETTINGS.eurExchangeRate),
    reservationTimeStep: row.reservation_time_step ?? DEFAULT_APP_SETTINGS.reservationTimeStep,
    reservationMaxGuestsPerSlot:
      row.reservation_max_guests_per_slot ?? DEFAULT_APP_SETTINGS.reservationMaxGuestsPerSlot,
    reservationTableHoldingTime:
      row.reservation_table_holding_time ?? DEFAULT_APP_SETTINGS.reservationTableHoldingTime,
    reservationOperatingHours: parseOperatingHours(row.reservation_operating_hours),
    receiptFontSize: parseReceiptFontSize(row.receipt_font_size),
    receiptFontWeight: parseReceiptFontWeight(row.receipt_font_weight),
    receiptFontFamily: parseReceiptFontFamily(row.receipt_font_family),
    adminDeletionPassword: row.admin_deletion_password ?? DEFAULT_APP_SETTINGS.adminDeletionPassword,
    cfdAdVideoUrl: row.cfd_ad_video_url ?? DEFAULT_APP_SETTINGS.cfdAdVideoUrl,
    cfdReviewUrl: row.cfd_review_url ?? DEFAULT_APP_SETTINGS.cfdReviewUrl,
    cfdReviewQrImageUrl: row.cfd_review_qr_image_url ?? DEFAULT_APP_SETTINGS.cfdReviewQrImageUrl,
    marqueeEnabled: row.marquee_enabled ?? DEFAULT_APP_SETTINGS.marqueeEnabled,
    marqueeText: row.marquee_text ?? DEFAULT_APP_SETTINGS.marqueeText,
    marqueeDurationSeconds: clampMarqueeDurationSeconds(
      parseNumericSetting(row.marquee_duration_seconds, DEFAULT_APP_SETTINGS.marqueeDurationSeconds),
    ),
    marqueeFontFamily: parseMarqueeFontFamily(row.marquee_font_family),
    marqueeEndAt: row.marquee_end_at ?? DEFAULT_APP_SETTINGS.marqueeEndAt,
    marqueeOnPos: row.marquee_on_pos ?? DEFAULT_APP_SETTINGS.marqueeOnPos,
    marqueeOnClient: row.marquee_on_client ?? DEFAULT_APP_SETTINGS.marqueeOnClient,
    marqueeOnKds: row.marquee_on_kds ?? DEFAULT_APP_SETTINGS.marqueeOnKds,
    marqueeOnBar: row.marquee_on_bar ?? DEFAULT_APP_SETTINGS.marqueeOnBar,
  };
}

function mapSettingsToRow(partial: Partial<AppSettings>): Record<string, unknown> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (partial.printerIp !== undefined) payload.printer_ip = partial.printerIp;
  if (partial.printerPort !== undefined) payload.printer_port = partial.printerPort;
  if (partial.silentPrintEnabled !== undefined) {
    payload.silent_print_enabled = partial.silentPrintEnabled;
  }
  if (partial.printBridgeUrl !== undefined) payload.print_bridge_url = partial.printBridgeUrl;
  if (partial.browserPrintFallback !== undefined) {
    payload.browser_print_fallback = partial.browserPrintFallback;
  }
  if (partial.printers !== undefined) payload.printers = partial.printers;
  if (partial.autoPrintOnPayment !== undefined) payload.auto_print_on_payment = partial.autoPrintOnPayment;
  if (partial.kitchenPrintEnabled !== undefined) payload.kitchen_print_enabled = partial.kitchenPrintEnabled;
  if (partial.kitchenPrintViaStation !== undefined) {
    payload.kitchen_print_via_station = partial.kitchenPrintViaStation;
  }
  if (partial.kitchenPrintPrimaryLang !== undefined) {
    payload.kitchen_print_primary_lang = partial.kitchenPrintPrimaryLang;
  }
  if (partial.kitchenPrintSecondaryLang !== undefined) {
    payload.kitchen_print_secondary_lang = partial.kitchenPrintSecondaryLang;
  }
  if (partial.kitchenPrintOrderFontSize !== undefined) {
    payload.kitchen_print_order_font_size = partial.kitchenPrintOrderFontSize;
  }
  if (partial.kitchenPrintMessageFontSize !== undefined) {
    payload.kitchen_print_message_font_size = partial.kitchenPrintMessageFontSize;
  }
  if (partial.receiptHeaderTitle !== undefined) payload.receipt_header_title = partial.receiptHeaderTitle;
  if (partial.receiptLegalName !== undefined) payload.receipt_legal_name = partial.receiptLegalName;
  if (partial.receiptAddress !== undefined) payload.receipt_address = partial.receiptAddress;
  if (partial.receiptCompanyAddress !== undefined) payload.receipt_company_address = partial.receiptCompanyAddress;
  if (partial.receiptIco !== undefined) payload.receipt_ico = partial.receiptIco;
  if (partial.receiptDic !== undefined) {
    payload.receipt_dic = partial.receiptDic;
    payload.receipt_tax_id = partial.receiptDic;
  }
  if (partial.receiptPhone !== undefined) payload.receipt_phone = partial.receiptPhone;
  if (partial.receiptFooterNote !== undefined) payload.receipt_footer_note = partial.receiptFooterNote;
  if (partial.customAlertSoundUrl !== undefined) payload.custom_alert_sound_url = partial.customAlertSoundUrl;
  if (partial.soundConfigs !== undefined) payload.sound_configs = soundConfigsToDb(partial.soundConfigs);
  if (partial.showPricesOnOrderScreen !== undefined) {
    payload.show_prices_on_order_screen = partial.showPricesOnOrderScreen;
  }
  if (partial.menuItemLayout !== undefined) payload.menu_item_layout = partial.menuItemLayout;
  if (partial.enablePriceRounding !== undefined) payload.enable_price_rounding = partial.enablePriceRounding;
  if (partial.showEurCurrency !== undefined) payload.show_eur_currency = partial.showEurCurrency;
  if (partial.eurExchangeRate !== undefined) payload.eur_exchange_rate = partial.eurExchangeRate;
  if (partial.reservationTimeStep !== undefined) payload.reservation_time_step = partial.reservationTimeStep;
  if (partial.reservationMaxGuestsPerSlot !== undefined) {
    payload.reservation_max_guests_per_slot = partial.reservationMaxGuestsPerSlot;
  }
  if (partial.reservationTableHoldingTime !== undefined) {
    payload.reservation_table_holding_time = partial.reservationTableHoldingTime;
  }
  if (partial.reservationOperatingHours !== undefined) {
    payload.reservation_operating_hours = partial.reservationOperatingHours;
  }
  if (partial.receiptFontSize !== undefined) payload.receipt_font_size = partial.receiptFontSize;
  if (partial.receiptFontWeight !== undefined) payload.receipt_font_weight = partial.receiptFontWeight;
  if (partial.receiptFontFamily !== undefined) payload.receipt_font_family = partial.receiptFontFamily;
  if (partial.adminDeletionPassword !== undefined) {
    payload.admin_deletion_password = partial.adminDeletionPassword;
  }
  if (partial.cfdAdVideoUrl !== undefined) payload.cfd_ad_video_url = partial.cfdAdVideoUrl;
  if (partial.cfdReviewUrl !== undefined) payload.cfd_review_url = partial.cfdReviewUrl;
  if (partial.cfdReviewQrImageUrl !== undefined) {
    payload.cfd_review_qr_image_url = partial.cfdReviewQrImageUrl;
  }
  if (partial.marqueeEnabled !== undefined) payload.marquee_enabled = partial.marqueeEnabled;
  if (partial.marqueeText !== undefined) payload.marquee_text = partial.marqueeText;
  if (partial.marqueeDurationSeconds !== undefined) {
    payload.marquee_duration_seconds = clampMarqueeDurationSeconds(partial.marqueeDurationSeconds);
  }
  if (partial.marqueeFontFamily !== undefined) payload.marquee_font_family = partial.marqueeFontFamily;
  if (partial.marqueeEndAt !== undefined) payload.marquee_end_at = partial.marqueeEndAt || null;
  if (partial.marqueeOnPos !== undefined) payload.marquee_on_pos = partial.marqueeOnPos;
  if (partial.marqueeOnClient !== undefined) payload.marquee_on_client = partial.marqueeOnClient;
  if (partial.marqueeOnKds !== undefined) payload.marquee_on_kds = partial.marqueeOnKds;
  if (partial.marqueeOnBar !== undefined) payload.marquee_on_bar = partial.marqueeOnBar;
  return payload;
}

export async function fetchAppSettings(businessId?: string | null) {
  const query = businessId
    ? supabase.from("settings").select("*").eq("business_id", businessId).maybeSingle()
    : supabase.from("settings").select("*").eq("id", 1).maybeSingle();

  const { data, error } = await query;
  if (error) return { data: DEFAULT_APP_SETTINGS, error };
  if (!data) return { data: DEFAULT_APP_SETTINGS, error: null };
  return { data: mapSettingsRow(data as SettingsRow), error: null };
}

export async function updateAppSettings(partial: Partial<AppSettings>, businessId?: string | null) {
  const payload = mapSettingsToRow(partial);

  if (businessId) {
    const { data: existing, error: lookupError } = await supabase
      .from("settings")
      .select("id")
      .eq("business_id", businessId)
      .maybeSingle();

    if (lookupError) return { data: null, error: lookupError };

    if (existing) {
      const { data, error } = await supabase
        .from("settings")
        .update(payload)
        .eq("business_id", businessId)
        .select("*")
        .single();
      if (error) return { data: null, error };
      return { data: mapSettingsRow(data as SettingsRow), error: null };
    }

    const { data, error } = await supabase
      .from("settings")
      .insert({ business_id: businessId, ...payload })
      .select("*")
      .single();
    if (error) return { data: null, error };
    return { data: mapSettingsRow(data as SettingsRow), error: null };
  }

  const { data, error } = await supabase
    .from("settings")
    .upsert({ id: 1, ...payload }, { onConflict: "id" })
    .select("*")
    .single();

  if (error) return { data: null, error };
  return { data: mapSettingsRow(data as SettingsRow), error: null };
}

export async function uploadCustomAlertSound(file: File, businessId?: string | null) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "mp3";
  if (!["mp3", "wav"].includes(extension)) {
    return { data: null, error: new Error("Only .mp3 and .wav files are supported") };
  }

  const path = `alert-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("audio_alerts").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || (extension === "wav" ? "audio/wav" : "audio/mpeg"),
  });

  if (uploadError) return { data: null, error: uploadError };

  const { data: publicData } = supabase.storage.from("audio_alerts").getPublicUrl(path);
  return updateAppSettings({ customAlertSoundUrl: publicData.publicUrl }, businessId);
}

async function uploadCfdMediaFile(file: File, prefix: string, allowedExtensions: string[]) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExtensions.includes(extension)) {
    return {
      data: null,
      error: new Error(`Supported formats: ${allowedExtensions.join(", ")}`),
    };
  }

  const path = `${prefix}-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("cfd_media").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || undefined,
  });

  if (uploadError) return { data: null, error: uploadError };

  const { data: publicData } = supabase.storage.from("cfd_media").getPublicUrl(path);
  return { data: publicData.publicUrl, error: null as Error | null };
}

export async function uploadCfdAdVideo(file: File, businessId?: string | null) {
  const { data: url, error } = await uploadCfdMediaFile(file, "cfd-ad", ["mp4", "webm", "gif"]);
  if (error || !url) return { data: null, error: error ?? new Error("Upload failed") };
  return updateAppSettings({ cfdAdVideoUrl: url }, businessId);
}

export async function uploadCfdReviewQrImage(file: File, businessId?: string | null) {
  const { data: url, error } = await uploadCfdMediaFile(file, "cfd-qr", [
    "png",
    "jpg",
    "jpeg",
    "webp",
  ]);
  if (error || !url) return { data: null, error: error ?? new Error("Upload failed") };
  return updateAppSettings({ cfdReviewQrImageUrl: url }, businessId);
}

export function subscribeToSettingsChanges(onChange: () => void) {
  // Unique channel per subscription — avoids Strict Mode / HMR reusing a subscribed channel.
  const channelName = `settings-realtime-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const channel = supabase
    .channel(channelName)
    .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, () => onChange())
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function fetchPendingReservationCount() {
  const { count, error } = await supabase
    .from("reservations")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  return { count: count ?? 0, error };
}

export type PrinterBillSettingsDraft = Pick<
  AppSettings,
  | "printerIp"
  | "printerPort"
  | "silentPrintEnabled"
  | "printBridgeUrl"
  | "browserPrintFallback"
  | "printers"
  | "autoPrintOnPayment"
  | "kitchenPrintEnabled"
  | "kitchenPrintViaStation"
  | "kitchenPrintPrimaryLang"
  | "kitchenPrintSecondaryLang"
  | "kitchenPrintOrderFontSize"
  | "kitchenPrintMessageFontSize"
  | "receiptHeaderTitle"
  | "receiptLegalName"
  | "receiptAddress"
  | "receiptCompanyAddress"
  | "receiptIco"
  | "receiptDic"
  | "receiptPhone"
  | "receiptFooterNote"
>;

export type SettingsPageDraft = PrinterBillSettingsDraft &
  Pick<
    AppSettings,
    | "showPricesOnOrderScreen"
    | "menuItemLayout"
    | "enablePriceRounding"
    | "showEurCurrency"
    | "eurExchangeRate"
    | "reservationTimeStep"
    | "reservationMaxGuestsPerSlot"
    | "reservationTableHoldingTime"
    | "reservationOperatingHours"
    | "receiptFontSize"
    | "receiptFontWeight"
    | "receiptFontFamily"
    | "adminDeletionPassword"
    | "marqueeEnabled"
    | "marqueeText"
    | "marqueeDurationSeconds"
    | "marqueeFontFamily"
    | "marqueeEndAt"
    | "marqueeOnPos"
    | "marqueeOnClient"
    | "marqueeOnKds"
    | "marqueeOnBar"
    | "soundConfigs"
  >;

export function pickPrinterBillDraft(settings: AppSettings): PrinterBillSettingsDraft {
  return {
    printerIp: settings.printerIp,
    printerPort: settings.printerPort,
    silentPrintEnabled: settings.silentPrintEnabled,
    printBridgeUrl: settings.printBridgeUrl,
    browserPrintFallback: settings.browserPrintFallback,
    printers: settings.printers,
    autoPrintOnPayment: settings.autoPrintOnPayment,
    kitchenPrintEnabled: settings.kitchenPrintEnabled,
    kitchenPrintViaStation: settings.kitchenPrintViaStation,
    kitchenPrintPrimaryLang: settings.kitchenPrintPrimaryLang,
    kitchenPrintSecondaryLang: settings.kitchenPrintSecondaryLang,
    kitchenPrintOrderFontSize: settings.kitchenPrintOrderFontSize,
    kitchenPrintMessageFontSize: settings.kitchenPrintMessageFontSize,
    receiptHeaderTitle: settings.receiptHeaderTitle,
    receiptLegalName: settings.receiptLegalName,
    receiptAddress: settings.receiptAddress,
    receiptCompanyAddress: settings.receiptCompanyAddress,
    receiptIco: settings.receiptIco,
    receiptDic: settings.receiptDic,
    receiptPhone: settings.receiptPhone,
    receiptFooterNote: settings.receiptFooterNote,
  };
}

export function pickSettingsPageDraft(settings: AppSettings): SettingsPageDraft {
  return {
    ...pickPrinterBillDraft(settings),
    showPricesOnOrderScreen: settings.showPricesOnOrderScreen,
    menuItemLayout: settings.menuItemLayout,
    enablePriceRounding: settings.enablePriceRounding,
    showEurCurrency: settings.showEurCurrency,
    eurExchangeRate: settings.eurExchangeRate,
    reservationTimeStep: settings.reservationTimeStep,
    reservationMaxGuestsPerSlot: settings.reservationMaxGuestsPerSlot,
    reservationTableHoldingTime: settings.reservationTableHoldingTime,
    reservationOperatingHours: settings.reservationOperatingHours,
    receiptFontSize: settings.receiptFontSize,
    receiptFontWeight: settings.receiptFontWeight,
    receiptFontFamily: settings.receiptFontFamily,
    adminDeletionPassword: settings.adminDeletionPassword,
    marqueeEnabled: settings.marqueeEnabled,
    marqueeText: settings.marqueeText,
    marqueeDurationSeconds: settings.marqueeDurationSeconds,
    marqueeFontFamily: settings.marqueeFontFamily,
    marqueeEndAt: settings.marqueeEndAt,
    marqueeOnPos: settings.marqueeOnPos,
    marqueeOnClient: settings.marqueeOnClient,
    marqueeOnKds: settings.marqueeOnKds,
    marqueeOnBar: settings.marqueeOnBar,
    soundConfigs: settings.soundConfigs,
  };
}
