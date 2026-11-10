// Optional persistent runner. Queue state and leases are stored exclusively in PostgreSQL.
// Run under a process supervisor; a crash/restart never loses payments or pending jobs.
import { setTimeout as pause } from "node:timers/promises";

const endpoint = new URL(process.env.EET_WORKER_URL ?? "https://invalid.local/api/eet/worker");
const token = process.env.EET_WORKER_SECRET;
if (endpoint.protocol !== "https:" || endpoint.pathname !== "/api/eet/worker" || endpoint.username || endpoint.password || !token || token.length < 32) {
  throw new Error("Configure an HTTPS EET_WORKER_URL and a strong EET_WORKER_SECRET.");
}
const shutdown = new AbortController();
process.once("SIGTERM", () => shutdown.abort());
process.once("SIGINT", () => shutdown.abort());
while (!shutdown.signal.aborted) {
  try {
    const response = await fetch(endpoint, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(25_000)]) });
    if (!response.ok) throw new Error("Worker endpoint unavailable.");
    const result = await response.json();
    // Only bounded status metadata goes to supervisor logs. No tokens, sale data or SOAP XML.
    if (result.processed) process.stdout.write(`EET worker: ${String(result.state)}\n`);
    if (!result.processed || ["uncertain", "retrying", "blocked"].includes(result.state)) await pause(1000, undefined, { signal: shutdown.signal });
  } catch {
    if (shutdown.signal.aborted) break;
    process.stderr.write("EET worker request failed; persistent queue retained.\n");
    await pause(5000, undefined, { signal: shutdown.signal }).catch(() => {});
  }
}
