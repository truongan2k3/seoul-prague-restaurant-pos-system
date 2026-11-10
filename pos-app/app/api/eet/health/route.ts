import { isEetWorkerAuthorized } from "@/src/lib/eet/worker-auth";
import { eetDb, requireEetBusinessId } from "@/src/lib/eet/db";
import { certificateStatus } from "@/src/lib/eet/credentials";
import type { EetSettings } from "@/src/lib/eet/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** Read-only monitor endpoint; checking health must never submit a payment. */
export async function GET(request: Request) {
  if (!isEetWorkerAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = eetDb(), businessId = requireEetBusinessId();
    const [settings, queue] = await Promise.all([
      db.from("eet_settings").select("*").eq("business_id", businessId).maybeSingle(),
      db.rpc("eet_queue_health", { p_business: businessId }),
    ]);
    if (settings.error || queue.error) throw new Error("Health unavailable");
    const cfg = settings.data as EetSettings | null;
    const certificate = certificateStatus(cfg?.capture_environment ?? "playground");
    const reasons: string[] = [];
    if (queue.data.errors) reasons.push("Failed, uncertain or held transactions need review");
    if (queue.data.overdue) reasons.push("Reporting deadline exceeded; obligations remain active");
    if (queue.data.oldest && Date.now() - Date.parse(queue.data.oldest) > 300_000) reasons.push("Pending queue has not cleared within five minutes");
    if (cfg?.capture_environment) {
      if (!cfg.worker_seen_at || Date.now() - Date.parse(cfg.worker_seen_at) > 120_000) reasons.push("Worker heartbeat stale");
      if (certificate.warning) reasons.push("Certificate invalid, missing or expiring within 30 days");
      if (queue.data.pending > 0 && (cfg.mode === "disabled" || cfg.submission_control === "paused")) reasons.push("Pending obligations while submissions are stopped");
    }
    return Response.json({ healthy: reasons.length === 0, reasons, queue: queue.data, mode: cfg?.mode ?? "disabled",
      lastSuccess: cfg?.last_success_at ?? null, workerSeenAt: cfg?.worker_seen_at ?? null,
      certificateValid: certificate.valid, certificateExpiresAt: certificate.expiresAt },
      { status: reasons.length ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ healthy: false, reasons: ["EET health query unavailable"] }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
