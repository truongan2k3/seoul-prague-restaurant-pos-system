"use server";

import { DEFAULT_APP_SETTINGS } from "@/src/lib/settings-actions";
import { hashPassword, slugifyBusinessName, uniqueSlugSuffix, verifyPassword } from "@/src/lib/auth/password";
import {
  clearAuthSession,
  readAuthSession,
  writeAuthSession,
  type AuthSessionPayload,
} from "@/src/lib/auth/session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

const DEFAULT_BUSINESS_NAME = "JING CHENG";
const DEFAULT_BUSINESS_SLUG = "jing-cheng";
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "1";

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
};

type BusinessAccountRow = {
  id: string;
  business_id: string;
  username: string;
  password_hash: string;
  password_salt: string;
  role: string;
};

export type AuthBusiness = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
};

export type AuthAccount = {
  id: string;
  businessId: string;
  username: string;
  role: string;
};

function mapBusiness(row: BusinessRow): AuthBusiness {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url ?? "",
  };
}

function toSessionPayload(business: AuthBusiness, account: BusinessAccountRow): AuthSessionPayload {
  return {
    accountId: account.id,
    businessId: business.id,
    username: account.username,
    businessName: business.name,
    logoUrl: business.logoUrl,
  };
}

async function ensureSettingsForBusiness(businessId: string) {
  try {
    const supabase = createSupabaseAdmin();
    const { data: existing } = await supabase
      .from("settings")
      .select("id")
      .eq("business_id", businessId)
      .maybeSingle();

    if (existing) return;

    const legacy = await supabase.from("settings").select("id").eq("id", 1).maybeSingle();
    if (legacy.data) {
      await supabase.from("settings").update({ business_id: businessId }).eq("id", 1);
      return;
    }

    await supabase.from("settings").insert({
      business_id: businessId,
      printer_ip: DEFAULT_APP_SETTINGS.printerIp,
      printer_port: DEFAULT_APP_SETTINGS.printerPort,
      silent_print_enabled: DEFAULT_APP_SETTINGS.silentPrintEnabled,
      print_bridge_url: DEFAULT_APP_SETTINGS.printBridgeUrl,
      browser_print_fallback: DEFAULT_APP_SETTINGS.browserPrintFallback,
      printers: DEFAULT_APP_SETTINGS.printers,
      auto_print_on_payment: DEFAULT_APP_SETTINGS.autoPrintOnPayment,
      kitchen_print_enabled: DEFAULT_APP_SETTINGS.kitchenPrintEnabled,
      kitchen_print_primary_lang: DEFAULT_APP_SETTINGS.kitchenPrintPrimaryLang,
      kitchen_print_secondary_lang: DEFAULT_APP_SETTINGS.kitchenPrintSecondaryLang,
      kitchen_print_order_font_size: DEFAULT_APP_SETTINGS.kitchenPrintOrderFontSize,
      kitchen_print_message_font_size: DEFAULT_APP_SETTINGS.kitchenPrintMessageFontSize,
      receipt_header_title: DEFAULT_BUSINESS_NAME,
      receipt_legal_name: DEFAULT_APP_SETTINGS.receiptLegalName,
      receipt_address: DEFAULT_APP_SETTINGS.receiptAddress,
      receipt_company_address: DEFAULT_APP_SETTINGS.receiptCompanyAddress,
      receipt_ico: DEFAULT_APP_SETTINGS.receiptIco,
      receipt_dic: DEFAULT_APP_SETTINGS.receiptDic,
      receipt_phone: DEFAULT_APP_SETTINGS.receiptPhone,
      receipt_footer_note: DEFAULT_APP_SETTINGS.receiptFooterNote,
      custom_alert_sound_url: DEFAULT_APP_SETTINGS.customAlertSoundUrl,
    });
  } catch {
    // Non-fatal — login can proceed; settings load may use defaults until fixed.
  }
}

function assertSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error("envNotConfigured");
  }
}

/** Seed JING CHENG + admin/1 on first run (idempotent). */
export async function ensureDefaultBusinessSeed() {
  assertSupabaseEnv();
  const supabase = createSupabaseAdmin();

  const { data: existingBusiness, error: lookupError } = await supabase
    .from("businesses")
    .select("id, name, slug, logo_url")
    .eq("slug", DEFAULT_BUSINESS_SLUG)
    .maybeSingle();

  if (lookupError) throw lookupError;

  let business: BusinessRow | null = existingBusiness as BusinessRow | null;

  if (!business) {
    const { data: created, error } = await supabase
      .from("businesses")
      .insert({ name: DEFAULT_BUSINESS_NAME, slug: DEFAULT_BUSINESS_SLUG })
      .select("id, name, slug, logo_url")
      .single();

    if (error) throw error;
    business = created as BusinessRow;
  }

  const { data: existingAccount } = await supabase
    .from("business_accounts")
    .select("id")
    .eq("business_id", business.id)
    .eq("username", DEFAULT_ADMIN_USERNAME)
    .maybeSingle();

  if (!existingAccount) {
    const { hash, salt } = hashPassword(DEFAULT_ADMIN_PASSWORD);
    const { error: accountError } = await supabase.from("business_accounts").insert({
      business_id: business.id,
      username: DEFAULT_ADMIN_USERNAME,
      password_hash: hash,
      password_salt: salt,
      role: "owner",
    });
    if (accountError) throw accountError;
  }

  await ensureSettingsForBusiness(business.id);
}

function mapAuthError(error: unknown): "envNotConfigured" | "databaseNotReady" {
  if (error instanceof Error && error.message === "envNotConfigured") {
    return "envNotConfigured";
  }
  return "databaseNotReady";
}

export async function getAuthSessionAction(): Promise<AuthSessionPayload | null> {
  try {
    await ensureDefaultBusinessSeed();
  } catch {
    // Tables may not exist yet — login page will show migration hint.
  }
  return readAuthSession();
}

export async function loginAction(username: string, password: string) {
  const trimmedUser = username.trim().toLowerCase();
  const trimmedPass = password;

  if (!trimmedUser || !trimmedPass) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  try {
    await ensureDefaultBusinessSeed();
  } catch (error) {
    return { ok: false as const, error: mapAuthError(error) };
  }

  const supabase = createSupabaseAdmin();
  const { data: account, error } = await supabase
    .from("business_accounts")
    .select("id, business_id, username, password_hash, password_salt, role")
    .ilike("username", trimmedUser)
    .maybeSingle();

  if (error || !account) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  const row = account as BusinessAccountRow;
  if (!verifyPassword(trimmedPass, row.password_hash, row.password_salt)) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug, logo_url")
    .eq("id", row.business_id)
    .single();

  if (businessError || !business) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  const mapped = mapBusiness(business as BusinessRow);
  await ensureSettingsForBusiness(mapped.id);
  const session = toSessionPayload(mapped, row);
  await writeAuthSession(session);

  return { ok: true as const, session };
}

export async function registerBusinessAction(input: {
  businessName: string;
  username: string;
  password: string;
}) {
  const businessName = input.businessName.trim();
  const username = input.username.trim().toLowerCase();
  const password = input.password;

  if (businessName.length < 2) {
    return { ok: false as const, error: "businessNameTooShort" };
  }
  if (username.length < 2) {
    return { ok: false as const, error: "usernameTooShort" };
  }
  if (password.length < 1) {
    return { ok: false as const, error: "passwordTooShort" };
  }

  try {
    await ensureDefaultBusinessSeed();
  } catch (error) {
    return { ok: false as const, error: mapAuthError(error) };
  }

  const supabase = createSupabaseAdmin();

  const { data: existingUser } = await supabase
    .from("business_accounts")
    .select("id")
    .ilike("username", username)
    .maybeSingle();

  if (existingUser) {
    return { ok: false as const, error: "usernameTaken" };
  }

  let slug = slugifyBusinessName(businessName);
  const { data: slugConflict } = await supabase.from("businesses").select("id").eq("slug", slug).maybeSingle();
  if (slugConflict) slug = `${slug}-${uniqueSlugSuffix()}`;

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .insert({ name: businessName, slug })
    .select("id, name, slug, logo_url")
    .single();

  if (businessError || !business) {
    return { ok: false as const, error: "registerFailed" };
  }

  const { hash, salt } = hashPassword(password);
  const { data: account, error: accountError } = await supabase
    .from("business_accounts")
    .insert({
      business_id: business.id,
      username,
      password_hash: hash,
      password_salt: salt,
      role: "owner",
    })
    .select("id, business_id, username, password_hash, password_salt, role")
    .single();

  if (accountError || !account) {
    await supabase.from("businesses").delete().eq("id", business.id);
    return { ok: false as const, error: "registerFailed" };
  }

  await ensureSettingsForBusiness(business.id);

  const mapped = mapBusiness(business as BusinessRow);
  const session = toSessionPayload(mapped, account as BusinessAccountRow);
  await writeAuthSession(session);

  return { ok: true as const, session };
}

export async function logoutAction() {
  await clearAuthSession();
  return { ok: true as const };
}

export async function fetchBusinessBrandingAction(businessId: string) {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, slug, logo_url")
    .eq("id", businessId)
    .maybeSingle();

  if (error || !data) return { data: null, error };
  return { data: mapBusiness(data as BusinessRow), error: null };
}

export async function updateBusinessLogoAction(businessId: string, logoUrl: string) {
  const session = await readAuthSession();
  if (!session || session.businessId !== businessId) {
    return { ok: false as const, error: "unauthorized" };
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from("businesses").update({ logo_url: logoUrl }).eq("id", businessId);

  if (error) return { ok: false as const, error: error.message };

  await writeAuthSession({ ...session, logoUrl });
  return { ok: true as const, logoUrl };
}

export async function uploadBusinessLogoAction(businessId: string, formData: FormData) {
  const session = await readAuthSession();
  if (!session || session.businessId !== businessId) {
    return { ok: false as const, error: "unauthorized" };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false as const, error: "noFile" };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const allowed = ["png", "jpg", "jpeg", "webp", "svg"];
  if (!allowed.includes(ext)) {
    return { ok: false as const, error: "invalidFileType" };
  }

  const path = `${businessId}/logo-${Date.now()}.${ext}`;
  const supabase = createSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from("business_branding").upload(path, buffer, {
    contentType: file.type || `image/${ext === "svg" ? "svg+xml" : ext}`,
    upsert: true,
  });

  if (uploadError) return { ok: false as const, error: uploadError.message };

  const { data: publicData } = supabase.storage.from("business_branding").getPublicUrl(path);
  return updateBusinessLogoAction(businessId, publicData.publicUrl);
}

export async function clearBusinessLogoAction(businessId: string) {
  return updateBusinessLogoAction(businessId, "");
}
