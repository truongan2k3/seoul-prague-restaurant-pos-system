"use server";

import { eetActor } from "./auth";
import { certificateStatus, loadCredentials } from "./credentials";
import { assertProductionAllowed, assertProductionIdentity, csvCell, validateData } from "./policy";
import { runEetWorker, testEetConnection, testSignedPlaygroundResponse } from "./worker";
import type { EetSettings, EetStatus, EetTransaction } from "./types";
import { getMaterialOverview } from "./material-store";
import { materialEncryptionReady } from "./material-crypto";
import { EetProbeError, probeStep } from "./probe-errors";
import { describeEetSetupFailure } from "./setup-diagnostics";
import { settingsSaveFailure } from "./settings-errors";

const SETTINGS_FIELDS = ["mode", "submission_control", "business_name", "establishment_address", "eic", "unit_id", "register_id", "tip_policy"] as const;
export type EetSettingsInput = Pick<EetSettings, typeof SETTINGS_FIELDS[number]>;
export interface EetPreparation { id: string; savedAt: string; value: EetSettingsInput }
export interface EetFilters { from: string; to: string; status?: EetStatus | "all"; method?: "cash" | "card" | "all"; search?: string; page?: number }
export interface EetStats { accepted: number; pending: number; failed: number; retrying: number; uncertain: number; blocked: number; processing: number; total: number; amount: string; overdue: number }

function defaultSettings(businessId: string): EetSettings {
  return { business_id: businessId, mode: "disabled", submission_control: "paused", business_name: "", establishment_address: "", eic: "", unit_id: "", register_id: "", tip_policy: "review_required", capture_environment: null, live_reporting_started_at: null, last_success_at: null, worker_seen_at: null, worker_error: null, version: 1, updated_at: new Date().toISOString() };
}

function validPreparation(value: unknown): value is EetSettingsInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return Object.keys(input).length === SETTINGS_FIELDS.length && SETTINGS_FIELDS.every(key => typeof input[key] === "string" && (input[key] as string).length <= (key === "establishment_address" ? 500 : key === "business_name" ? 200 : key === "register_id" ? 20 : 64))
    && ["disabled", "playground", "production"].includes(input.mode as string)
    && ["automatic", "paused"].includes(input.submission_control as string)
    && ["review_required", "employee_income", "business_income"].includes(input.tip_policy as string);
}

async function getPreparation(db: Awaited<ReturnType<typeof eetActor>>["db"], businessId: string, version: number): Promise<EetPreparation | null> {
  const { data, error } = await db.from("eet_audit_logs").select("id,details,created_at").eq("business_id", businessId)
    .eq("action", "preparation_saved").order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("EET preparation could not be loaded.");
  // A later Apply invalidates the old draft, but its audit record remains intact.
  if (!data || data.details?.active_version !== version || !validPreparation(data.details?.value)) return null;
  return { id: String(data.id), savedAt: data.created_at, value: data.details.value };
}

/** Incomplete owner details may be prepared now. This append-only configuration
 * draft never changes eet_settings, capture, the payment queue or worker state.
 * Private keys/certificates use the separate encrypted material import only. */
export async function saveEetPreparationAction(value: EetSettingsInput, version: number) {
  try {
    const { db, businessId, staff } = await eetActor(true);
    if (!validPreparation(value) || !Number.isInteger(version)) throw new Error("Invalid EET settings.");
    const { data: active, error: activeError } = await db.from("eet_settings").select("version").eq("business_id", businessId).maybeSingle();
    if (activeError) throw new Error("EET schema unavailable. Apply the additive migration after the database preflight.");
    if ((active?.version ?? 1) !== version) throw new Error("Settings changed. Reload before saving");
    const { data, error } = await db.from("eet_audit_logs").insert({ business_id: businessId, actor_id: staff.id, action: "preparation_saved", details: { active_version: version, value } })
      .select("id,created_at").single();
    if (error || !data) throw new Error("EET preparation could not be saved.");
    return { ok: true as const, preparation: { id: String(data.id), savedAt: data.created_at, value } satisfies EetPreparation,
      message: "Preparation saved. Reporting has not been activated or changed. Missing details can be completed later." };
  } catch (error) { return settingsSaveFailure(error); }
}
function filterValues(filters: EetFilters) {
  const from = new Date(filters.from), to = new Date(filters.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 366 * 86_400_000) throw new Error("Choose a valid date range (maximum 366 days).");
  const status = filters.status && filters.status !== "all" ? filters.status : null;
  if (status && !["pending", "processing", "retrying", "uncertain", "accepted", "failed", "blocked"].includes(status)) throw new Error("Invalid status filter.");
  const method = filters.method && filters.method !== "all" ? filters.method : null;
  if (method && !["cash", "card"].includes(method)) throw new Error("Invalid payment filter.");
  const search = (filters.search ?? "").trim();
  if (search.length > 50 || (search && !/^[a-zA-Z0-9-]+$/.test(search))) throw new Error("Search using a transaction ID, sale ID or fiscal sequence (letters, numbers, hyphens).");
  return { from: from.toISOString(), to: to.toISOString(), status, method, search: search || null };
}
export async function getEetSettingsAction() {
  const { db, businessId } = await eetActor(true);
  const { data, error } = await db.from("eet_settings").select("*").eq("business_id", businessId).maybeSingle();
  if (error) throw new Error("EET schema unavailable. Apply the additive migration after the database preflight.");
  const [{ data: queue, error: queueError }, audit] = await Promise.all([
    db.rpc("eet_queue_health", { p_business: businessId }),
    db.from("eet_audit_logs").select("id,actor_id,action,details,created_at").eq("business_id", businessId)
      .in("action", ["settings_changed", "preparation_saved", "connection_test", "material_imported", "manager_unlocked", "manager_unlock_attempt"]).order("created_at", { ascending: false }).limit(20),
  ]);
  if (queueError) throw new Error("EET queue health query unavailable.");
  if (audit.error) throw new Error("EET audit query unavailable.");
  const settings = (data as EetSettings | null) ?? defaultSettings(businessId);
  const [materials, playground, production, preparation] = await Promise.all([getMaterialOverview(businessId), certificateStatus("playground"), certificateStatus("production"), getPreparation(db, businessId, settings.version)]);
  return { settings, preparation, health: queue as { pending: number; errors: number; overdue: number; oldest: string | null },
    audit: audit.data, materials, certificates: { playground, production },
    readiness: { encryption: materialEncryptionReady(), workerHealthy: Boolean(data?.worker_seen_at && Date.now() - Date.parse(data.worker_seen_at) <= 120_000), checkout: process.env.EET_CHECKOUT_ENABLED === "true", worker: process.env.EET_WORKER_ENABLED === "true", protocol: process.env.EET_PROTOCOL_REVIEWED === "true", productionApproved: process.env.EET_PRODUCTION_APPROVED === "true" && process.env.EET_COMPLIANCE_REVIEW_APPROVED === "true" } };
}

export type EetSettingsSaveResult = ReturnType<typeof settingsSaveFailure> | { ok: true; settings: EetSettings | null; message: string };

export async function saveEetSettingsAction(value: EetSettingsInput, version: number, confirmation: string): Promise<EetSettingsSaveResult> {
  try {
    const { db, businessId, staff } = await eetActor(true);
    if (!value || Object.keys(value).some(k => !SETTINGS_FIELDS.includes(k as typeof SETTINGS_FIELDS[number])) || SETTINGS_FIELDS.some(k => typeof value[k] !== "string") || !Number.isInteger(version)) throw new Error("Invalid EET settings.");
    if (!["disabled", "playground", "production"].includes(value.mode) || !["automatic", "paused"].includes(value.submission_control) || !["review_required", "employee_income", "business_income"].includes(value.tip_policy)) throw new Error("Invalid EET configuration.");
    if (value.business_name.length > 200 || value.establishment_address.length > 500) throw new Error("Business information is too long.");
    assertProductionAllowed(value.mode);
    assertProductionIdentity(value.mode, value.eic);
    if (value.mode !== "disabled") {
      validateData({ eic_popl: value.eic, id_jednotky: value.unit_id, id_pokl: value.register_id, porad_cis: "CHECK", dat_trzby: "2027-01-01T00:00:00Z", celk_trzba: "0.00" });
      if (value.tip_policy === "review_required" || !value.business_name.trim() || !value.establishment_address.trim()) throw new Error("Complete business information and confirm the tip policy before enabling capture.");
      if (process.env.EET_CHECKOUT_ENABLED !== "true") throw new Error("Deploy and verify secure EET checkout before enabling capture.");
      if (value.submission_control === "automatic") {
        if (process.env.EET_WORKER_ENABLED !== "true") throw new Error("Configure the durable worker before automatic submission.");
        if (process.env.EET_PROTOCOL_REVIEWED !== "true") throw new Error("Review and pin the official WSDL/XSD before submission.");
        const environment = value.mode;
        await probeStep("credentials", () => loadCredentials(environment, value.eic));
      }
    }
    const { error } = await db.rpc("eet_save_settings", { p_business: businessId, p_actor: staff.id, p_version: version, p_value: value, p_confirmation: confirmation });
    if (error) throw new Error(error.message);
    // The write has committed. A later read/health failure must not turn this into
    // a failed-save message or reset the form from an old parent snapshot.
    const unconfirmed = { ok: true as const, settings: null, message: "EET settings were saved, but the stored values could not be reloaded. Use Recheck setup before saving again. All queued transactions are preserved." };
    try {
      const { data: saved, error: readError } = await db.from("eet_settings").select("*").eq("business_id", businessId).single();
      if (readError || !saved) return unconfirmed;
      const settings = saved as EetSettings;
      const matches = SETTINGS_FIELDS.every(key => settings[key] === value[key]);
      return { ok: true, settings, message: matches
        ? `EET settings saved: ${settings.mode} · ${settings.submission_control}. All queued transactions are preserved.`
        : "Your changes were saved, but another save changed them again. Showing the current stored configuration; review it before continuing." };
    } catch { return unconfirmed; }
  } catch (error) { return settingsSaveFailure(error); }
}

export interface EetProbeActionResult { ok: boolean; message: string; errorCode?: string }
function probeFailure(code: string, message: string): EetProbeActionResult {
  return { ok: false, errorCode: code, message: `${code}: ${message}` };
}

// Expected failures must be serializable results: Next.js masks thrown server
// errors in production. Only allowlisted descriptions cross this boundary.
async function performEetProbe(signed: boolean): Promise<EetProbeActionResult> {
  let stage: "authorization" | "settings" | "materials" | "probe" | "audit" = "authorization";
  try {
    const { db, businessId, staff } = await eetActor(true);
    stage = "settings";
    const { data, error } = await db.from("eet_settings").select("*").eq("business_id", businessId).maybeSingle();
    if (error) return probeFailure("EET_TEST_SETTINGS", "Saved EET settings could not be read. Recheck setup and the server database connection.");
    const active = (data as EetSettings | null) ?? defaultSettings(businessId);
    const preparation = await getPreparation(db, businessId, active.version);
    // Probes may use prepared unit/register details without applying them. Their
    // target still follows the active connection mode (signed probe is fixed PG).
    const settings = preparation ? { ...active, ...preparation.value, mode: active.mode, submission_control: active.submission_control } : active;
    const target = signed || settings.mode === "disabled" ? "playground" : settings.mode;
    if (!settings.unit_id || !settings.register_id) return probeFailure("EET_TEST_REGISTER_FIELDS", "Save the Unit ID and POS/register identifier in Business and register before testing.");
    stage = "materials";
    const overview = await getMaterialOverview(businessId);
    const testEic = target === "playground" ? overview.items.find(item => item.environment === "playground" && item.kind === "signer")?.metadata.eic : undefined;
    const input = { ...settings, mode: target, eic: testEic ?? settings.eic };
    stage = "probe";
    const result = await (signed ? testSignedPlaygroundResponse(input) : testEetConnection(input));
    stage = "audit";
    const { error: auditError } = await db.from("eet_audit_logs").insert({ business_id: businessId, actor_id: staff.id, action: "connection_test", details: {
      environment: target, verification_only: !signed,
      ...(signed ? { purpose: "signed_acknowledgment_acceptance", test_only: true, accounting_payment_created: false } : {}), ...result,
    } });
    if (auditError) return probeFailure("EET_TEST_AUDIT", "The endpoint returned a result, but the connection audit could not be saved. Check EET audit storage before proceeding; reporting mode is unchanged.");
    if (!result.ok) {
      const code = result.result.kind === "rejected" && /^-?\d{1,3}$/.test(result.result.code) ? result.result.code : "unknown";
      return probeFailure("EET_TEST_REJECTED", `EET rejected the test (official code ${code}). Review the official error in Configuration and connection audit. Reporting mode is unchanged.`);
    }
    return { ok: true, message: signed
      ? "Signed Playground acknowledgment verified. This was a zero-value test; no POS payment was created and Production remains unchanged."
      : "Verification succeeded (official code 0). No sale was reported; reporting mode is unchanged." };
  } catch (error) {
    if (error instanceof EetProbeError) return probeFailure(error.code, error.message);
    const issue = describeEetSetupFailure(error);
    if (issue.code !== "EET_SETUP_UNAVAILABLE") return probeFailure(issue.code, `${issue.title} ${issue.action}`);
    if (stage === "authorization") return probeFailure("EET_TEST_ACCESS", "The server could not verify manager access. Recheck setup, then unlock EET with the manager code again.");
    if (stage === "settings") return probeFailure("EET_TEST_SETTINGS", "Saved settings could not be loaded. Recheck setup and the database connection.");
    if (stage === "materials") return probeFailure("EET_TEST_MATERIALS", "Saved certificate metadata could not be loaded. Recheck encrypted storage and keep the existing encryption key.");
    if (stage === "audit") return probeFailure("EET_TEST_AUDIT", "The test returned a result, but its audit could not be saved. Check EET audit storage before proceeding.");
    return probeFailure("EET_TEST_UNAVAILABLE", "The EET check could not finish. Recheck setup and retry. No reporting settings were changed.");
  }
}

export async function testEetConnectionAction(): Promise<EetProbeActionResult> {
  return performEetProbe(false);
}

export async function testSignedPlaygroundResponseAction(): Promise<EetProbeActionResult> {
  return performEetProbe(true);
}

export async function retryEetTransactionAction(id: string, reason: string) {
  const { db, businessId, staff } = await eetActor(true);
  if (!/^[0-9a-f-]{36}$/i.test(id) || typeof reason !== "string" || reason.trim().length < 5 || reason.length > 500) throw new Error("Select a transaction and enter an audit reason.");
  const { error } = await db.rpc("eet_manual_retry", { p_business: businessId, p_actor: staff.id, p_id: id, p_reason: reason.trim() });
  if (error) throw new Error(error.message);
}

export async function runEetWorkerAction() {
  await eetActor(true);
  return runEetWorker();
}

export async function getEetDashboardAction(filters: EetFilters) {
  const { db, businessId } = await eetActor(true);
  const f = filterValues(filters);
  const page = Number.isInteger(filters.page) ? Math.max(0, Math.min(1000, filters.page!)) : 0;
  let query = db.from("eet_transactions").select("*", { count: "exact" }).eq("business_id", businessId).gte("created_at", f.from).lt("created_at", f.to);
  if (f.status) query = query.eq("status", f.status);
  if (f.method) query = query.eq("payment_method", f.method);
  if (f.search) query = query.or(`id.eq.${/^[0-9a-f-]{36}$/i.test(f.search) ? f.search : "00000000-0000-0000-0000-000000000000"},sale_id.eq.${/^[0-9a-f-]{36}$/i.test(f.search) ? f.search : "00000000-0000-0000-0000-000000000000"},data->>porad_cis.ilike.%${f.search}%`);
  const [rows, stats] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id").range(page * 50, page * 50 + 49),
    db.rpc("eet_dashboard_stats", { p_business: businessId, p_from: f.from, p_to: f.to, p_status: f.status, p_method: f.method, p_search: f.search }),
  ]);
  if (rows.error || stats.error) throw new Error("EET dashboard query failed.");
  return { rows: (rows.data ?? []) as EetTransaction[], count: rows.count ?? 0, stats: stats.data as EetStats, page };
}

export async function getEetDetailsAction(id: string) {
  const { db, businessId } = await eetActor(true);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid transaction ID.");
  const [transaction, attempts, audit] = await Promise.all([
    db.from("eet_transactions").select("*").eq("business_id", businessId).eq("id", id).single(),
    db.from("eet_attempts").select("id,message_id,attempt_number,started_at,finished_at,outcome,http_status,global_transaction_id,result,request_sha256,response_sha256").eq("business_id", businessId).eq("transaction_id", id).order("attempt_number", { ascending: false }).limit(100),
    db.from("eet_audit_logs").select("id,action,actor_id,created_at,details").eq("business_id", businessId).eq("transaction_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (transaction.error || attempts.error || audit.error) throw new Error("EET transaction unavailable.");
  return { transaction: transaction.data as EetTransaction, attempts: attempts.data, audit: audit.data };
}

export async function exportEetCsvAction(filters: EetFilters) {
  const { db, businessId, staff } = await eetActor(true);
  const f = filterValues(filters);
  const records: EetTransaction[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db.rpc("eet_export_rows", { p_business: businessId, p_from: f.from, p_to: f.to, p_status: f.status, p_method: f.method, p_search: f.search, p_offset: page * 500 });
    if (error) throw new Error("CSV export failed.");
    if (records.length + (data?.length ?? 0) > 50_000) throw new Error("Narrow the export date range (maximum 50,000 records).");
    records.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
  }
  const fields = ["id", "sale_id", "environment", "kind", "payment_method", "amount", "status", "created_at", "due_at", "sequence", "pok", "last_error"];
  const csv = [fields, ...records.map(row => [row.id, row.sale_id, row.environment, row.kind, row.payment_method, Number(row.amount), row.status, row.created_at, row.due_at, row.data.porad_cis, row.acknowledgment?.pok, row.last_error])].map(row => row.map(csvCell).join(",")).join("\r\n");
  if (Buffer.byteLength(csv, "utf8") > 3 * 1024 * 1024) throw new Error("CSV is too large for a server response. Choose a narrower date range.");
  const { error } = await db.from("eet_audit_logs").insert({ business_id: businessId, actor_id: staff.id, action: "csv_export", details: { from: f.from, to: f.to, rows: records.length } });
  if (error) throw new Error("CSV audit failed.");
  return csv;
}
