import "server-only";
import { randomUUID } from "node:crypto";
import { eetDb, requireEetBusinessId } from "./db";
import { loadCredentials } from "./credentials";
import { retryDelayMs } from "./policy";
import { parseEetResponse, sha256, signSaleXml } from "./xml";
import { postEet, type TransportResponse } from "./transport";
import type { EetTransaction, EetResult, EetSettings } from "./types";

/** An invocation processes one job (<=4s network + DB). A durable scheduler invokes again.
 * No detached promises, in-memory queues, or work continuing beyond Vercel's lifetime. */
export async function runEetWorker() {
  if (process.env.EET_WORKER_ENABLED !== "true") return { processed: 0, state: "disabled" };
  const db = eetDb();
  const businessId = requireEetBusinessId();
  const { data, error } = await db.rpc("eet_claim", { p_business: businessId });
  if (error) throw new Error("EET queue claim failed. Check migration and database availability.");
  const job = data?.[0] as EetTransaction | undefined;
  if (!job) return { processed: 0, state: "idle" };
  let attemptId: string | null = null;
  let response: TransportResponse | null = null;
  let result: EetResult | null = null;
  let stage: "configuration" | "persistence" | "sending" = "configuration";
  let status = "blocked";
  let safeError: string | null = null;
  try {
    const credentials = await loadCredentials(job.environment, job.data.eic_popl);
    stage = "persistence";
    const { data: attempt, error: attemptError } = await db.rpc("eet_begin_attempt", { p_id: job.id, p_lease: job.lease_token, p_hash: null });
    if (attemptError || !attempt) throw new Error("EET attempt could not be persisted or submissions were paused.");
    attemptId = attempt.id;
    const xml = signSaleXml({ data: job.data, messageId: attempt.message_id,
      sentAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), first: attempt.attempt_number === 1, ...credentials });
    const { error: hashError } = await db.from("eet_attempts").update({ request_sha256: sha256(xml) }).eq("id", attemptId).eq("outcome", "started");
    if (hashError) throw new Error("Attempt persistence failed before sending.");
    stage = "sending";
    response = await postEet(job.environment, xml, credentials.soapAction);
    result = parseEetResponse(response.xml, attempt.message_id, job.environment, credentials.trustedCertificates);
    if (result.kind === "accepted") status = "accepted";
    else if (result.kind === "rejected") { status = result.retryable ? "retrying" : "failed"; safeError = `EET ${result.code}: ${result.message}`; }
    else throw new Error("Operational payment was not acknowledged.");
  } catch {
    // Never return raw parser/crypto/network exceptions or SOAP XML; they can contain credentials.
    status = stage === "sending" ? "uncertain" : stage === "persistence" ? "retrying" : "blocked";
    safeError = stage === "sending" ? "No verified acknowledgment. Replay the same fiscal Data with a new message UUID."
      : stage === "persistence" ? "Attempt persistence/signing unavailable or submissions paused; retry scheduled."
      : "Submission configuration/signing unavailable or paused. Review certificate, protocol artifacts, approvals and attempt audit.";
  }
  const retryAt = new Date(Date.now() + retryDelayMs(job.attempt_count + 1)).toISOString();
  const { data: finished, error: finishError } = await db.rpc("eet_finish_attempt", {
    p_id: job.id, p_lease: job.lease_token, p_attempt: attemptId, p_status: status,
    p_result: result?.kind === "accepted" ? result.acknowledgment : result,
    p_retry_at: retryAt, p_error: safeError, p_http: response?.httpStatus ?? null,
    p_trace: response?.trace ?? null, p_response_hash: response ? sha256(response.xml) : null,
  });
  if (finishError) throw new Error("EET result persistence failed; lease recovery will reconcile the immutable transaction.");
  return { processed: 1, state: finished ? status : "lease_lost" };
}

export async function testEetConnection(settings: EetSettings) {
  if (settings.mode === "disabled") throw new Error("Select Playground and save settings before testing.");
  const credentials = await loadCredentials(settings.mode, settings.eic, { verification: true });
  const messageId = randomUUID();
  const xml = signSaleXml({ data: { eic_popl: settings.eic, id_jednotky: settings.unit_id, id_pokl: settings.register_id,
    porad_cis: `TEST-${Date.now()}`, dat_trzby: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), celk_trzba: "0.00" },
    messageId, sentAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), first: true, verification: true, ...credentials });
  const response = await postEet(settings.mode, xml, credentials.soapAction);
  const result = parseEetResponse(response.xml, messageId, settings.mode, credentials.trustedCertificates, true);
  return { ok: result.kind === "verified", result, trace: response.trace };
}
