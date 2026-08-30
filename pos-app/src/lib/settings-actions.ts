import type {
  AppSettings,
  CfdSlideshowItem,
  KitchenPrintFontSize,
  KitchenPrintLanguage,
  MenuItemLayout,
  MenuSortMode,
  NetworkPrinter,
  PrinterRole,
  ReservationOperatingHours,
  SoundConfigs,
} from "@/lib/types";
import { DEFAULT_SOUND_CONFIGS, parseSoundConfigs, soundConfigsToDb } from "@/lib/auto-serve";
import { parseReservationReminderMode } from "@/lib/reservation-reminder";
import { DEFAULT_RESERVATION_OPERATING_HOURS } from "@/lib/reservation-slots";
import {
  clampMarqueeDurationSeconds,
  defaultMarqueeConfigs,
  legacyMarqueeFieldsFromConfigs,
  parseMarqueeConfigsJson,
  parseMarqueeFontFamily,
  resolveMarqueeConfigs,
} from "@/lib/marquee-settings";
import {
  parseReceiptFontFamily,
  parseReceiptFontSize,
  parseReceiptFontWeight,
} from "@/lib/receipt-print-styles";
import {
  DEFAULT_RECEIPT_SECTION_SIZES,
  parseReceiptSectionSizes,
} from "@/lib/receipt-section-sizes";
import {
  clampKitchenClipTopMm,
  clampKitchenClipBottomMm,
  clampKitchenItemGapPx,
  DEFAULT_KITCHEN_CLIP_TOP_MM,
  DEFAULT_KITCHEN_CLIP_BOTTOM_MM,
  DEFAULT_KITCHEN_ITEM_GAP_PX,
  DEFAULT_KITCHEN_PRINT_LAYOUT,
  parseKitchenClipTopMm,
  parseKitchenClipBottomMm,
  parseKitchenItemGapPx,
  parseKitchenPrintLayout,
} from "@/lib/kitchen-print-layout";
import {
  DEFAULT_RECEIPT_BRANDING_VISIBILITY,
  parseReceiptBrandingVisibility,
} from "@/lib/receipt-branding";
import { inferCfdMediaType } from "@/lib/cfd-slideshow";
import {
  parseKitchenFulfillmentMode,
  type KitchenFulfillmentMode,
} from "@/lib/kitchen-fulfillment-mode";
import {
  DEFAULT_RESERVATION_EVENT_TYPES,
  DEFAULT_RESERVATION_GUEST_TEXTS,
  DEFAULT_RESERVATION_GUEST_VENUE,
  DEFAULT_RESERVATION_REQUIRED_FIELDS,
  parseReservationEventTypes,
  parseReservationGuestTexts,
  parseReservationGuestVenue,
  parseReservationRequiredFields,
} from "@/lib/reservation-guest-form";
import { supabase } from "@/src/lib/supabase";

export function createDefaultPrinters(host = "192.168.1.200", port = "9100"): NetworkPrinter[] {
  return [
    {
      id: "printer-kitchen",
      name: "Kitchen",
      host,
      port,
      enabled: true,
      roles: ["kitchen", "kitchen-message"],
      legacyBitmap: false,
    },
    {
      id: "printer-bar",
      name: "Bar",
      host,
      port,
      enabled: true,
      roles: ["receipt", "bar"],
      legacyBitmap: false,
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
  kitchenFulfillmentMode: "both" as KitchenFulfillmentMode,
  kitchenPrintViaStation: true,
  kitchenPrintPrimaryLang: "zh",
  kitchenPrintSecondaryLang: "en",
  kitchenPrintOrderFontSize: "xlarge",
  kitchenPrintMessageFontSize: "xlarge",
  kitchenPrintOrderFontWeight: "bold",
  kitchenPrintMessageFontWeight: "bold",
  kitchenPrintLayout: DEFAULT_KITCHEN_PRINT_LAYOUT,
  kitchenPrintClipTopMm: DEFAULT_KITCHEN_CLIP_TOP_MM,
  kitchenPrintClipBottomMm: DEFAULT_KITCHEN_CLIP_BOTTOM_MM,
  kitchenPrintItemGapPx: DEFAULT_KITCHEN_ITEM_GAP_PX,
  receiptBrandingVisibility: { ...DEFAULT_RECEIPT_BRANDING_VISIBILITY },
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
  showEurOnMenu: false,
  eurExchangeRate: 25,
  reservationTimeStep: 30,
  reservationMaxGuestsPerSlot: 20,
  reservationTableHoldingTime: 90,
  reservationOperatingHours: DEFAULT_RESERVATION_OPERATING_HOURS,
  mapReservationTickerSeconds: 6,
  reservationReminderMode: "30",
  reservationRequiredFields: { ...DEFAULT_RESERVATION_REQUIRED_FIELDS },
  reservationEventTypes: [...DEFAULT_RESERVATION_EVENT_TYPES],
  reservationGuestTexts: {
    emailHint: { ...DEFAULT_RESERVATION_GUEST_TEXTS.emailHint },
    successTitle: { ...DEFAULT_RESERVATION_GUEST_TEXTS.successTitle },
    successBody: { ...DEFAULT_RESERVATION_GUEST_TEXTS.successBody },
    successEmailSent: { ...DEFAULT_RESERVATION_GUEST_TEXTS.successEmailSent },
    successManageLink: { ...DEFAULT_RESERVATION_GUEST_TEXTS.successManageLink },
    gdprConsent: { ...DEFAULT_RESERVATION_GUEST_TEXTS.gdprConsent },
  },
  reservationGuestVenue: { ...DEFAULT_RESERVATION_GUEST_VENUE },
  receiptFontSize: "normal",
  receiptFontWeight: "normal",
  receiptFontFamily: "courier",
  receiptSectionSizes: { ...DEFAULT_RECEIPT_SECTION_SIZES },
  receiptPrintBitmap: false,
  adminDeletionPassword: "8888",
  cfdAdVideoUrl: "",
  cfdAdSlideshow: [],
  menuCategorySortMode: "custom",
  menuItemSortMode: "custom",
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
  marqueeConfigs: defaultMarqueeConfigs(),
  changelogPopupEnabled: false,
  changelogPopupTitle: "What's new",
  changelogPopupBody: "",
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
  kitchen_fulfillment_mode?: string | null;
  kitchen_print_via_station?: boolean | null;
  kitchen_print_primary_lang?: string | null;
  kitchen_print_secondary_lang?: string | null;
  kitchen_print_order_font_size?: string | null;
  kitchen_print_message_font_size?: string | null;
  kitchen_print_order_font_weight?: string | null;
  kitchen_print_message_font_weight?: string | null;
  kitchen_print_layout?: unknown;
  kitchen_print_clip_top_mm?: number | string | null;
  kitchen_print_clip_bottom_mm?: number | string | null;
  kitchen_print_item_gap_px?: number | string | null;
  receipt_branding_visibility?: unknown;
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
  show_eur_on_menu?: boolean | null;
  eur_exchange_rate?: number | string | null;
  reservation_time_step?: number | null;
  reservation_max_guests_per_slot?: number | null;
  reservation_table_holding_time?: number | null;
  reservation_operating_hours?: ReservationOperatingHours | null;
  map_reservation_ticker_seconds?: number | null;
  reservation_reminder_mode?: string | null;
  reservation_required_fields?: unknown;
  reservation_event_types?: unknown;
  reservation_guest_texts?: unknown;
  reservation_guest_venue?: unknown;
  receipt_font_size?: string | null;
  receipt_font_weight?: string | null;
  receipt_font_family?: string | null;
  receipt_section_sizes?: unknown;
  receipt_print_bitmap?: boolean | null;
  admin_deletion_password?: string | null;
  cfd_ad_video_url?: string | null;
  cfd_ad_slideshow?: unknown;
  menu_category_sort_mode?: string | null;
  menu_item_sort_mode?: string | null;
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
  marquee_configs?: unknown;
  changelog_popup_enabled?: boolean | null;
  changelog_popup_title?: string | null;
  changelog_popup_body?: string | null;
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
  const resolvedRoles: PrinterRole[] =
    roles.length > 0 ? roles : (["receipt"] as PrinterRole[]);
  const legacyBitmap =
    typeof row.legacy_bitmap === "boolean"
      ? row.legacy_bitmap
      : typeof row.legacyBitmap === "boolean"
        ? row.legacyBitmap
        : false;
  return {
    id,
    name,
    host,
    port: typeof row.port === "string" && row.port.trim() ? row.port.trim() : "9100",
    enabled: row.enabled !== false,
    roles: resolvedRoles,
    legacyBitmap,
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

function parseMenuSortMode(value: string | null | undefined): MenuSortMode {
  return value === "alphabetical" ? "alphabetical" : "custom";
}

function parseCfdSlideshow(value: unknown): CfdSlideshowItem[] {
  if (!Array.isArray(value)) return [];
  const items: CfdSlideshowItem[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!url) continue;
    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : `slide-${items.length}-${Date.now()}`;
    const rawType = record.type;
    const type =
      rawType === "image" || rawType === "video" || rawType === "gif"
        ? rawType
        : inferCfdMediaType(url);
    const durationRaw = record.durationSeconds;
    const durationSeconds =
      typeof durationRaw === "number" && Number.isFinite(durationRaw) && durationRaw > 0
        ? durationRaw
        : undefined;
    items.push({ id, url, type, durationSeconds });
  }
  return items;
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
    kitchenFulfillmentMode: parseKitchenFulfillmentMode(row.kitchen_fulfillment_mode),
    kitchenPrintViaStation:
      row.kitchen_print_via_station ?? DEFAULT_APP_SETTINGS.kitchenPrintViaStation,
    kitchenPrintPrimaryLang: parseKitchenPrintPrimary(row.kitchen_print_primary_lang),
    kitchenPrintSecondaryLang: parseKitchenPrintSecondary(row.kitchen_print_secondary_lang),
    kitchenPrintOrderFontSize: parseKitchenPrintFontSize(row.kitchen_print_order_font_size),
    kitchenPrintMessageFontSize: parseKitchenPrintFontSize(
      row.kitchen_print_message_font_size ?? row.kitchen_print_order_font_size,
    ),
    kitchenPrintOrderFontWeight: parseReceiptFontWeight(row.kitchen_print_order_font_weight),
    kitchenPrintMessageFontWeight: parseReceiptFontWeight(
      row.kitchen_print_message_font_weight ?? row.kitchen_print_order_font_weight,
    ),
    kitchenPrintLayout: parseKitchenPrintLayout(row.kitchen_print_layout),
    kitchenPrintClipTopMm: parseKitchenClipTopMm(row.kitchen_print_clip_top_mm),
    kitchenPrintClipBottomMm: parseKitchenClipBottomMm(row.kitchen_print_clip_bottom_mm),
    kitchenPrintItemGapPx: parseKitchenItemGapPx(row.kitchen_print_item_gap_px),
    receiptBrandingVisibility: parseReceiptBrandingVisibility(row.receipt_branding_visibility),
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
    showEurOnMenu: row.show_eur_on_menu ?? DEFAULT_APP_SETTINGS.showEurOnMenu,
    eurExchangeRate: parseNumericSetting(row.eur_exchange_rate, DEFAULT_APP_SETTINGS.eurExchangeRate),
    reservationTimeStep: row.reservation_time_step ?? DEFAULT_APP_SETTINGS.reservationTimeStep,
    reservationMaxGuestsPerSlot:
      row.reservation_max_guests_per_slot ?? DEFAULT_APP_SETTINGS.reservationMaxGuestsPerSlot,
    reservationTableHoldingTime:
      row.reservation_table_holding_time ?? DEFAULT_APP_SETTINGS.reservationTableHoldingTime,
    reservationOperatingHours: parseOperatingHours(row.reservation_operating_hours),
    mapReservationTickerSeconds:
      row.map_reservation_ticker_seconds ?? DEFAULT_APP_SETTINGS.mapReservationTickerSeconds,
    reservationReminderMode: parseReservationReminderMode(
      row.reservation_reminder_mode ?? DEFAULT_APP_SETTINGS.reservationReminderMode,
    ),
    reservationRequiredFields: parseReservationRequiredFields(row.reservation_required_fields),
    reservationEventTypes: parseReservationEventTypes(row.reservation_event_types),
    reservationGuestTexts: parseReservationGuestTexts(row.reservation_guest_texts),
    reservationGuestVenue: parseReservationGuestVenue(row.reservation_guest_venue),
    receiptFontSize: parseReceiptFontSize(row.receipt_font_size),
    receiptFontWeight: parseReceiptFontWeight(row.receipt_font_weight),
    receiptFontFamily: parseReceiptFontFamily(row.receipt_font_family),
    receiptSectionSizes: parseReceiptSectionSizes(row.receipt_section_sizes),
    receiptPrintBitmap: row.receipt_print_bitmap ?? DEFAULT_APP_SETTINGS.receiptPrintBitmap,
    adminDeletionPassword: row.admin_deletion_password ?? DEFAULT_APP_SETTINGS.adminDeletionPassword,
    cfdAdVideoUrl: row.cfd_ad_video_url ?? DEFAULT_APP_SETTINGS.cfdAdVideoUrl,
    cfdAdSlideshow: parseCfdSlideshow(row.cfd_ad_slideshow),
    menuCategorySortMode: parseMenuSortMode(row.menu_category_sort_mode),
    menuItemSortMode: parseMenuSortMode(row.menu_item_sort_mode),
    cfdReviewUrl: row.cfd_review_url ?? DEFAULT_APP_SETTINGS.cfdReviewUrl,
    cfdReviewQrImageUrl: row.cfd_review_qr_image_url ?? DEFAULT_APP_SETTINGS.cfdReviewQrImageUrl,
    ...(() => {
      const marqueeConfigs = resolveMarqueeConfigs({
        marqueeConfigs: parseMarqueeConfigsJson(row.marquee_configs),
        marqueeEnabled: row.marquee_enabled ?? DEFAULT_APP_SETTINGS.marqueeEnabled,
        marqueeText: row.marquee_text ?? DEFAULT_APP_SETTINGS.marqueeText,
        marqueeDurationSeconds: clampMarqueeDurationSeconds(
          parseNumericSetting(
            row.marquee_duration_seconds,
            DEFAULT_APP_SETTINGS.marqueeDurationSeconds,
          ),
        ),
        marqueeFontFamily: parseMarqueeFontFamily(row.marquee_font_family),
        marqueeEndAt: row.marquee_end_at ?? DEFAULT_APP_SETTINGS.marqueeEndAt,
        marqueeOnPos: row.marquee_on_pos ?? DEFAULT_APP_SETTINGS.marqueeOnPos,
        marqueeOnClient: row.marquee_on_client ?? DEFAULT_APP_SETTINGS.marqueeOnClient,
        marqueeOnKds: row.marquee_on_kds ?? DEFAULT_APP_SETTINGS.marqueeOnKds,
        marqueeOnBar: row.marquee_on_bar ?? DEFAULT_APP_SETTINGS.marqueeOnBar,
      });
      const legacy = legacyMarqueeFieldsFromConfigs(marqueeConfigs);
      return {
        marqueeConfigs,
        marqueeEnabled: legacy.marqueeEnabled,
        marqueeText: legacy.marqueeText,
        marqueeDurationSeconds: legacy.marqueeDurationSeconds,
        marqueeFontFamily: legacy.marqueeFontFamily,
        marqueeEndAt: legacy.marqueeEndAt,
        marqueeOnPos: legacy.marqueeOnPos,
        marqueeOnClient: legacy.marqueeOnClient,
        marqueeOnKds: legacy.marqueeOnKds,
        marqueeOnBar: legacy.marqueeOnBar,
      };
    })(),
    changelogPopupEnabled:
      row.changelog_popup_enabled ?? DEFAULT_APP_SETTINGS.changelogPopupEnabled,
    changelogPopupTitle:
      row.changelog_popup_title ?? DEFAULT_APP_SETTINGS.changelogPopupTitle,
    changelogPopupBody:
      row.changelog_popup_body ?? DEFAULT_APP_SETTINGS.changelogPopupBody,
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
  if (partial.kitchenFulfillmentMode !== undefined) {
    payload.kitchen_fulfillment_mode = partial.kitchenFulfillmentMode;
  }
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
  if (partial.kitchenPrintOrderFontWeight !== undefined) {
    payload.kitchen_print_order_font_weight = partial.kitchenPrintOrderFontWeight;
  }
  if (partial.kitchenPrintMessageFontWeight !== undefined) {
    payload.kitchen_print_message_font_weight = partial.kitchenPrintMessageFontWeight;
  }
  if (partial.kitchenPrintLayout !== undefined) {
    payload.kitchen_print_layout = partial.kitchenPrintLayout;
  }
  if (partial.kitchenPrintClipTopMm !== undefined) {
    payload.kitchen_print_clip_top_mm = clampKitchenClipTopMm(partial.kitchenPrintClipTopMm);
  }
  if (partial.kitchenPrintClipBottomMm !== undefined) {
    payload.kitchen_print_clip_bottom_mm = clampKitchenClipBottomMm(partial.kitchenPrintClipBottomMm);
  }
  if (partial.kitchenPrintItemGapPx !== undefined) {
    payload.kitchen_print_item_gap_px = clampKitchenItemGapPx(partial.kitchenPrintItemGapPx);
  }
  if (partial.receiptBrandingVisibility !== undefined) {
    payload.receipt_branding_visibility = partial.receiptBrandingVisibility;
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
  if (partial.showEurOnMenu !== undefined) payload.show_eur_on_menu = partial.showEurOnMenu;
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
  if (partial.mapReservationTickerSeconds !== undefined) {
    payload.map_reservation_ticker_seconds = partial.mapReservationTickerSeconds;
  }
  if (partial.reservationReminderMode !== undefined) {
    payload.reservation_reminder_mode = partial.reservationReminderMode;
  }
  if (partial.reservationRequiredFields !== undefined) {
    payload.reservation_required_fields = partial.reservationRequiredFields;
  }
  if (partial.reservationEventTypes !== undefined) {
    payload.reservation_event_types = partial.reservationEventTypes;
  }
  if (partial.reservationGuestTexts !== undefined) {
    payload.reservation_guest_texts = partial.reservationGuestTexts;
  }
  if (partial.reservationGuestVenue !== undefined) {
    payload.reservation_guest_venue = partial.reservationGuestVenue;
  }
  if (partial.receiptFontSize !== undefined) payload.receipt_font_size = partial.receiptFontSize;
  if (partial.receiptFontWeight !== undefined) payload.receipt_font_weight = partial.receiptFontWeight;
  if (partial.receiptFontFamily !== undefined) payload.receipt_font_family = partial.receiptFontFamily;
  if (partial.receiptSectionSizes !== undefined) {
    payload.receipt_section_sizes = parseReceiptSectionSizes(partial.receiptSectionSizes);
  }
  if (partial.receiptPrintBitmap !== undefined) payload.receipt_print_bitmap = partial.receiptPrintBitmap;
  if (partial.adminDeletionPassword !== undefined) {
    payload.admin_deletion_password = partial.adminDeletionPassword;
  }
  if (partial.cfdAdVideoUrl !== undefined) payload.cfd_ad_video_url = partial.cfdAdVideoUrl;
  if (partial.cfdAdSlideshow !== undefined) payload.cfd_ad_slideshow = partial.cfdAdSlideshow;
  if (partial.menuCategorySortMode !== undefined) {
    payload.menu_category_sort_mode = partial.menuCategorySortMode;
  }
  if (partial.menuItemSortMode !== undefined) payload.menu_item_sort_mode = partial.menuItemSortMode;
  if (partial.cfdReviewUrl !== undefined) payload.cfd_review_url = partial.cfdReviewUrl;
  if (partial.cfdReviewQrImageUrl !== undefined) {
    payload.cfd_review_qr_image_url = partial.cfdReviewQrImageUrl;
  }
  if (partial.marqueeConfigs !== undefined) {
    payload.marquee_configs = partial.marqueeConfigs;
    const legacy = legacyMarqueeFieldsFromConfigs(partial.marqueeConfigs);
    payload.marquee_enabled = legacy.marqueeEnabled;
    payload.marquee_text = legacy.marqueeText;
    payload.marquee_duration_seconds = legacy.marqueeDurationSeconds;
    payload.marquee_font_family = legacy.marqueeFontFamily;
    payload.marquee_end_at = legacy.marqueeEndAt || null;
    payload.marquee_on_pos = legacy.marqueeOnPos;
    payload.marquee_on_client = legacy.marqueeOnClient;
    payload.marquee_on_kds = legacy.marqueeOnKds;
    payload.marquee_on_bar = legacy.marqueeOnBar;
  } else {
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
  }
  if (partial.changelogPopupEnabled !== undefined) {
    payload.changelog_popup_enabled = partial.changelogPopupEnabled;
  }
  if (partial.changelogPopupTitle !== undefined) {
    payload.changelog_popup_title = partial.changelogPopupTitle;
  }
  if (partial.changelogPopupBody !== undefined) {
    payload.changelog_popup_body = partial.changelogPopupBody;
  }
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

export async function uploadAlertSoundFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "mp3";
  if (!["mp3", "wav"].includes(extension)) {
    return { data: null as string | null, error: new Error("Only .mp3 and .wav files are supported") };
  }

  const path = `alert-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("audio_alerts").upload(path, file, {
    cacheControl: "31536000",
    upsert: true,
    contentType: file.type || (extension === "wav" ? "audio/wav" : "audio/mpeg"),
  });

  if (uploadError) return { data: null, error: uploadError };

  const { data: publicData } = supabase.storage.from("audio_alerts").getPublicUrl(path);
  return { data: publicData.publicUrl, error: null as Error | null };
}

export async function uploadCustomAlertSound(file: File, businessId?: string | null) {
  const { data: url, error } = await uploadAlertSoundFile(file);
  if (error || !url) return { data: null, error: error ?? new Error("Upload failed") };
  return updateAppSettings({ customAlertSoundUrl: url }, businessId);
}

async function uploadCfdMediaFile(file: File, prefix: string, allowedExtensions: string[]) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExtensions.includes(extension)) {
    return {
      data: null,
      error: new Error(`Supported formats: ${allowedExtensions.join(", ")}`),
    };
  }

  const maxBytes = 100 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      data: null,
      error: new Error("File must be ≤ 100 MB."),
    };
  }

  const path = `${prefix}-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("cfd_media").upload(path, file, {
    cacheControl: "31536000",
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

export async function uploadCfdSlideshowMedia(file: File) {
  return uploadCfdMediaFile(file, "cfd-slide", [
    "mp4",
    "webm",
    "gif",
    "png",
    "jpg",
    "jpeg",
    "webp",
  ]);
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
  | "kitchenFulfillmentMode"
  | "kitchenPrintViaStation"
  | "kitchenPrintPrimaryLang"
  | "kitchenPrintSecondaryLang"
  | "kitchenPrintOrderFontSize"
  | "kitchenPrintMessageFontSize"
  | "kitchenPrintOrderFontWeight"
  | "kitchenPrintMessageFontWeight"
  | "kitchenPrintLayout"
  | "kitchenPrintClipTopMm"
  | "kitchenPrintClipBottomMm"
  | "kitchenPrintItemGapPx"
  | "receiptBrandingVisibility"
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
    | "showEurOnMenu"
    | "eurExchangeRate"
    | "reservationTimeStep"
    | "reservationMaxGuestsPerSlot"
    | "reservationTableHoldingTime"
    | "reservationOperatingHours"
    | "mapReservationTickerSeconds"
    | "reservationReminderMode"
    | "reservationRequiredFields"
    | "reservationEventTypes"
    | "reservationGuestTexts"
    | "reservationGuestVenue"
    | "receiptFontSize"
    | "receiptFontWeight"
    | "receiptFontFamily"
    | "receiptSectionSizes"
    | "receiptPrintBitmap"
    | "adminDeletionPassword"
    | "marqueeConfigs"
    | "soundConfigs"
    | "changelogPopupEnabled"
    | "changelogPopupTitle"
    | "changelogPopupBody"
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
    kitchenFulfillmentMode: settings.kitchenFulfillmentMode,
    kitchenPrintViaStation: settings.kitchenPrintViaStation,
    kitchenPrintPrimaryLang: settings.kitchenPrintPrimaryLang,
    kitchenPrintSecondaryLang: settings.kitchenPrintSecondaryLang,
    kitchenPrintOrderFontSize: settings.kitchenPrintOrderFontSize,
    kitchenPrintMessageFontSize: settings.kitchenPrintMessageFontSize,
    kitchenPrintOrderFontWeight: settings.kitchenPrintOrderFontWeight,
    kitchenPrintMessageFontWeight: settings.kitchenPrintMessageFontWeight,
    kitchenPrintLayout: settings.kitchenPrintLayout,
    kitchenPrintClipTopMm: settings.kitchenPrintClipTopMm,
    kitchenPrintClipBottomMm: settings.kitchenPrintClipBottomMm,
    kitchenPrintItemGapPx: settings.kitchenPrintItemGapPx,
    receiptBrandingVisibility: settings.receiptBrandingVisibility,
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
    showEurOnMenu: settings.showEurOnMenu,
    eurExchangeRate: settings.eurExchangeRate,
    reservationTimeStep: settings.reservationTimeStep,
    reservationMaxGuestsPerSlot: settings.reservationMaxGuestsPerSlot,
    reservationTableHoldingTime: settings.reservationTableHoldingTime,
    reservationOperatingHours: settings.reservationOperatingHours,
    mapReservationTickerSeconds: settings.mapReservationTickerSeconds,
    reservationReminderMode: settings.reservationReminderMode,
    reservationRequiredFields: { ...settings.reservationRequiredFields },
    reservationEventTypes: settings.reservationEventTypes.map((row) => ({
      id: row.id,
      labels: { ...row.labels },
    })),
    reservationGuestTexts: {
      emailHint: { ...settings.reservationGuestTexts.emailHint },
      successTitle: { ...settings.reservationGuestTexts.successTitle },
      successBody: { ...settings.reservationGuestTexts.successBody },
      successEmailSent: { ...settings.reservationGuestTexts.successEmailSent },
      successManageLink: { ...settings.reservationGuestTexts.successManageLink },
      gdprConsent: { ...settings.reservationGuestTexts.gdprConsent },
    },
    reservationGuestVenue: { ...settings.reservationGuestVenue },
    receiptFontSize: settings.receiptFontSize,
    receiptFontWeight: settings.receiptFontWeight,
    receiptFontFamily: settings.receiptFontFamily,
    receiptSectionSizes: settings.receiptSectionSizes,
    receiptPrintBitmap: settings.receiptPrintBitmap,
    adminDeletionPassword: settings.adminDeletionPassword,
    marqueeConfigs: resolveMarqueeConfigs(settings),
    soundConfigs: { ...DEFAULT_SOUND_CONFIGS, ...settings.soundConfigs },
    changelogPopupEnabled: settings.changelogPopupEnabled,
    changelogPopupTitle: settings.changelogPopupTitle,
    changelogPopupBody: settings.changelogPopupBody,
  };
}
