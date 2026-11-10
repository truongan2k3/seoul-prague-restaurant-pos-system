"use server";

import { eetActor } from "./auth";
import { certificateStatus, loadCredentials } from "./credentials";
import { assertProductionAllowed, assertProductionIdentity, csvCell, validateData } from "./policy";
import { runEetWorker, testEetConnection } from "./worker";
import type { EetSettings, EetStatus, EetTransaction } from "./types";
import { getMaterialOverview } from "./material-store";
import { materialEncryptionReady } from "./material-crypto";

const SETTINGS_FIELDS = ["mode", "submission_control", "business_name", "establishment_address", "eic", "unit_id", "register_id", "tip_policy"] as const;
export type EetSettingsInput = Pick<EetSettings, typeof SETTINGS_FIELDS[number]>;
export interface EetFilters { from: string; to: string; status?: EetStatus | "all"; method?: "cash" | "card" | "all"; search?: string; page?: number }
export interface EetStats { accepted: number; pending: number; failed: number; retrying: number; uncertain: number; blocked: number; processing: number; total: number; amount: string; overdue: number }

function defaultSettings(businessId: string): EetSettings {
  return { business_id: businessId, mode: "disabled", submission_control: "paused", business_name: "", establishment_address: "", eic: "", unit_id: "", register_id: "", tip_policy: "review_required", capture_environment: null, live_reporting_started_at: null, last_success_at: null, worker_seen_at: null, worker_error: null, version: 1, updated_at: new Date().toISOString() };
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
      .in("action", ["settings_changed", "connection_test", "material_imported", "manager_unlocked", "manager_unlock_attempt"]).order("created_at", { ascending: false }).limit(20),
  ]);
  if (queueError) throw new Error("EET queue health query unavailable.");
  if (audit.error) throw new Error("EET audit query unavailable.");
  const [materials, playground, production] = await Promise.all([getMaterialOverview(businessId), certificateStatus("playground"), certificateStatus("production")]);
  return { settings: (data as EetSettings | null) ?? defaultSettings(businessId), health: queue as { pending: number; errors: number; overdue: number; oldest: string | null },
    audit: audit.data, materials, certificates: { playground, production },
    readiness: { encryption: materialEncryptionReady(), workerHealthy: Boolean(data?.worker_seen_at && Date.now() - Date.parse(data.worker_seen_at) <= 120_000), checkout: process.env.EET_CHECKOUT_ENABLED === "true", worker: process.env.EET_WORKER_ENABLED === "true", protocol: process.env.EET_PROTOCOL_REVIEWED === "true", productionApproved: process.env.EET_PRODUCTION_APPROVED === "true" && process.env.EET_COMPLIANCE_REVIEW_APPROVED === "true" } };
}

export async function saveEetSettingsAction(value: EetSettingsInput, version: number, confirmation: string) {
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
      try { await loadCredentials(value.mode, value.eic); } catch { throw new Error("Certificate/protocol setup is incomplete. Automatic submissions remain locked."); }
    }
  }
  const { error } = await db.rpc("eet_save_settings", { p_business: businessId, p_actor: staff.id, p_version: version, p_value: value, p_confirmation: confirmation });
  if (error) throw new Error(error.message);
}

export async function testEetConnectionAction() {
  const { db, businessId, staff } = await eetActor(true);
  const { data, error } = await db.from("eet_settings").select("*").eq("business_id", businessId).maybeSingle();
  if (error) throw new Error("EET settings are unavailable.");
  const settings = (data as EetSettings | null) ?? defaultSettings(businessId);
  const target = settings.mode === "disabled" ? "playground" : settings.mode;
  const overview = await getMaterialOverview(businessId);
  const testEic = target === "playground" ? overview.items.find(item => item.environment === "playground" && item.kind === "signer")?.metadata.eic : undefined;
  if (!settings.unit_id || !settings.register_id) throw new Error("Save the unit and register identifiers above before testing the connection.");
  let result: Awaited<ReturnType<typeof testEetConnection>>;
  try { result = await testEetConnection({ ...settings, mode: target, eic: testEic ?? settings.eic }); }
  catch { throw new Error("EET connection test failed. Check server-only certificate, official artifacts, network and approval configuration."); }
  const { error: auditError } = await db.from("eet_audit_logs").insert({ business_id: businessId, actor_id: staff.id, action: "connection_test", details: { environment: target, verification_only: true, ...result } });
  if (auditError) throw new Error("Connection test completed but audit persistence failed.");
  return result;
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
