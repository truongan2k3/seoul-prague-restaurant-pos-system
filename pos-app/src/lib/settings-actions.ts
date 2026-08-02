import type { AppSettings } from "@/lib/types";
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
};

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
