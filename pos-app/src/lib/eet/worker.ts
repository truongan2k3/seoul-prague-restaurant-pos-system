import "server-only";
import { randomUUID } from "node:crypto";
import { eetDb, requireEetBusinessId } from "./db";
import { loadCredentials } from "./credentials";
import { retryDelayMs, PLAYGROUND_EICS } from "./policy";
import { parseEetResponse, sha256, signSaleXml } from "./xml";
import { postEet, type TransportResponse } from "./transport";
import type { EetTransaction, EetResult, EetSettings } from "./types";
import { responseVerificationCertificates } from "./response-trust";
import { probeStep } from "./probe-errors";

/** An invocation processes one job (bounded SOAP/CRL network calls + DB). A durable scheduler invokes again.
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
    const trusted = await responseVerificationCertificates(response.xml, credentials.trustedCertificates);
    result = parseEetResponse(response.xml, attempt.message_id, job.environment, trusted);
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
  const environment = settings.mode;
  const credentials = await probeStep("credentials", () => loadCredentials(environment, settings.eic, { verification: true }));
  const messageId = randomUUID();
  const xml = await probeStep("signing", () => signSaleXml({ data: { eic_popl: settings.eic, id_jednotky: settings.unit_id, id_pokl: settings.register_id,
    porad_cis: `TEST-${Date.now()}`, dat_trzby: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), celk_trzba: "0.00" },
    messageId, sentAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), first: true, verification: true, ...credentials }));
  const response = await probeStep("network", () => postEet(environment, xml, credentials.soapAction));
  const trusted = await probeStep("response_trust", () => responseVerificationCertificates(response.xml, credentials.trustedCertificates));
  const result = await probeStep("response", () => parseEetResponse(response.xml, messageId, environment, trusted, true));
  return { ok: result.kind === "verified", result, trace: response.trace };
}

/** Explicit operator probe: fixed Playground endpoint, reserved test identity and
 * zero amount. No database/payment/queue access and no Production activation. */
export async function testSignedPlaygroundResponse(settings: EetSettings) {
  const credentials = await probeStep("credentials", () => {
    if (!PLAYGROUND_EICS.some(eic => eic === settings.eic)) throw new Error("Use an official reserved Playground certificate for the signed response test.");
    return loadCredentials("playground", settings.eic, { playgroundAcceptance: true });
  });
  const messageId = randomUUID(), sentAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const xml = await probeStep("signing", () => signSaleXml({ data: { eic_popl: settings.eic, id_jednotky: settings.unit_id, id_pokl: settings.register_id,
    porad_cis: `PG-${randomUUID().replaceAll("-", "").slice(0, 20)}`, dat_trzby: sentAt, celk_trzba: "0.00" },
    messageId, sentAt, first: true, ...credentials }));
  const response = await probeStep("network", () => postEet("playground", xml, credentials.soapAction));
  const trusted = await probeStep("response_trust", () => responseVerificationCertificates(response.xml, credentials.trustedCertificates));
  const result = await probeStep("response", () => parseEetResponse(response.xml, messageId, "playground", trusted));
  return { ok: result.kind === "accepted", result, trace: response.trace };
}
