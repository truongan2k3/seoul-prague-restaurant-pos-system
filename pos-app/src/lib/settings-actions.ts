import type { AppSettings, ReservationOperatingHours, TerminalConnectionMode, TerminalType } from "@/lib/types";
import { DEFAULT_RESERVATION_OPERATING_HOURS } from "@/lib/reservation-slots";
import {
  parseReceiptFontFamily,
  parseReceiptFontSize,
  parseReceiptFontWeight,
} from "@/lib/receipt-print-styles";
import { supabase } from "@/src/lib/supabase";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  printerIp: "192.168.1.200",
  printerPort: "9100",
  autoPrintOnPayment: true,
  receiptHeaderTitle: "JIN CHENG",
  receiptLegalName: "JING DE INTER.TRADE, s.r.o.",
  receiptAddress: "Václavské nám. 819, 110 00 Praha",
  receiptCompanyAddress: "Václavské náměstí 819/43, 110 00 Praha",
  receiptIco: "25682199",
  receiptDic: "CZ25682199",
  receiptPhone: "+420 222 240 429",
  receiptFooterNote: "Děkujeme za Vaši návštěvu!\nOtevírací doba: Po-Ne 10:00-22:00",
  customAlertSoundUrl: "/sounds/default-bell.mp3",
  showPricesOnOrderScreen: true,
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
  terminalType: "network",
  terminalIp: "192.168.1.105",
  terminalPort: "2000",
  terminalPosId: "PVTL9664",
  terminalConnectionMode: "inbound",
};

type SettingsRow = {
  printer_ip: string;
  printer_port: string;
  auto_print_on_payment: boolean;
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
  show_prices_on_order_screen?: boolean | null;
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
  terminal_type?: string | null;
  terminal_ip?: string | null;
  terminal_port?: string | null;
  terminal_pos_id?: string | null;
  terminal_connection_mode?: string | null;
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

function parseTerminalConnectionMode(value: string | null | undefined): TerminalConnectionMode {
  return value === "outbound" ? "outbound" : "inbound";
}

function parseTerminalType(value: string | null | undefined): TerminalType {
  return value === "network" ? "network" : "mock";
}

function mapSettingsRow(row: SettingsRow): AppSettings {
  return {
    printerIp: row.printer_ip,
    printerPort: row.printer_port,
    autoPrintOnPayment: row.auto_print_on_payment,
    receiptHeaderTitle: row.receipt_header_title,
    receiptLegalName: row.receipt_legal_name ?? DEFAULT_APP_SETTINGS.receiptLegalName,
    receiptAddress: row.receipt_address,
    receiptCompanyAddress: row.receipt_company_address ?? DEFAULT_APP_SETTINGS.receiptCompanyAddress,
    receiptIco: row.receipt_ico ?? DEFAULT_APP_SETTINGS.receiptIco,
    receiptDic: row.receipt_dic ?? row.receipt_tax_id ?? DEFAULT_APP_SETTINGS.receiptDic,
    receiptPhone: row.receipt_phone,
    receiptFooterNote: row.receipt_footer_note,
    customAlertSoundUrl: row.custom_alert_sound_url,
    showPricesOnOrderScreen: row.show_prices_on_order_screen ?? DEFAULT_APP_SETTINGS.showPricesOnOrderScreen,
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
    terminalType: parseTerminalType(row.terminal_type),
    terminalIp: row.terminal_ip ?? DEFAULT_APP_SETTINGS.terminalIp,
    terminalPort: row.terminal_port ?? DEFAULT_APP_SETTINGS.terminalPort,
    terminalPosId: row.terminal_pos_id ?? DEFAULT_APP_SETTINGS.terminalPosId,
    terminalConnectionMode: parseTerminalConnectionMode(row.terminal_connection_mode),
  };
}

function mapSettingsToRow(partial: Partial<AppSettings>): Record<string, unknown> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (partial.printerIp !== undefined) payload.printer_ip = partial.printerIp;
  if (partial.printerPort !== undefined) payload.printer_port = partial.printerPort;
  if (partial.autoPrintOnPayment !== undefined) payload.auto_print_on_payment = partial.autoPrintOnPayment;
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
  if (partial.showPricesOnOrderScreen !== undefined) {
    payload.show_prices_on_order_screen = partial.showPricesOnOrderScreen;
  }
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
  if (partial.terminalType !== undefined) payload.terminal_type = partial.terminalType;
  if (partial.terminalIp !== undefined) payload.terminal_ip = partial.terminalIp;
  if (partial.terminalPort !== undefined) payload.terminal_port = partial.terminalPort;
  if (partial.terminalPosId !== undefined) payload.terminal_pos_id = partial.terminalPosId;
  if (partial.terminalConnectionMode !== undefined) {
    payload.terminal_connection_mode = partial.terminalConnectionMode;
  }
  return payload;
}

export async function fetchAppSettings() {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  if (error) return { data: DEFAULT_APP_SETTINGS, error };
  if (!data) return { data: DEFAULT_APP_SETTINGS, error: null };
  return { data: mapSettingsRow(data as SettingsRow), error: null };
}

export async function updateAppSettings(partial: Partial<AppSettings>) {
  const payload = mapSettingsToRow(partial);
  const { data, error } = await supabase
    .from("settings")
    .upsert({ id: 1, ...payload }, { onConflict: "id" })
    .select("*")
    .single();

  if (error) return { data: null, error };
  return { data: mapSettingsRow(data as SettingsRow), error: null };
}

export async function uploadCustomAlertSound(file: File) {
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
  return updateAppSettings({ customAlertSoundUrl: publicData.publicUrl });
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
  | "autoPrintOnPayment"
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
    | "terminalType"
    | "terminalIp"
    | "terminalPort"
    | "terminalPosId"
    | "terminalConnectionMode"
  >;

export function pickPrinterBillDraft(settings: AppSettings): PrinterBillSettingsDraft {
  return {
    printerIp: settings.printerIp,
    printerPort: settings.printerPort,
    autoPrintOnPayment: settings.autoPrintOnPayment,
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
    terminalType: settings.terminalType,
    terminalIp: settings.terminalIp,
    terminalPort: settings.terminalPort,
    terminalPosId: settings.terminalPosId,
    terminalConnectionMode: settings.terminalConnectionMode,
  };
}
