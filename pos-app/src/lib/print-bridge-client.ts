import type { AppSettings, NetworkPrinter, PrinterRole } from "@/lib/types";
import { printersForRole, printerUsesLegacyBitmap } from "@/lib/print-dispatch";
import { bytesToBase64 } from "@/src/lib/escpos";

export type PrintDispatchSettings = Pick<
  AppSettings,
  "silentPrintEnabled" | "printBridgeUrl" | "browserPrintFallback" | "printers"
>;

/** Must exceed server.mjs TCP connect timeout (4.5s) so printer IP errors reach POS intact. */
const BRIDGE_FETCH_TIMEOUT_MS = 12_000;

export type PrinterSendFailure = {
  id: string;
  name: string;
  host: string;
  error: string;
};

export type SilentPrintResult = {
  sent: boolean;
  succeededPrinterIds: string[];
  failedPrinters: PrinterSendFailure[];
  error?: string;
};

const RAW_PRINTER_PORTS = new Set([9100, 9101, 9102, 9103]);

function printersForRoleFromSettings(
  settings: PrintDispatchSettings,
  role: PrinterRole,
): NetworkPrinter[] {
  return printersForRole(settings.printers, role);
}

/** Reject URLs that point at a raw thermal port (common misconfig). */
export function validatePrintBridgeUrl(bridgeUrl: string): { ok: boolean; message: string } {
  const trimmed = bridgeUrl.trim();
  if (!trimmed) {
    return { ok: false, message: "Print bridge URL is empty" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: "Invalid bridge URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, message: "Bridge URL must start with http:// or https://" };
  }

  const port = parsed.port
    ? Number(parsed.port)
    : parsed.protocol === "https:"
      ? 443
      : 80;

  if (RAW_PRINTER_PORTS.has(port)) {
    return {
      ok: false,
      message:
        "Bridge URL must NOT be the printer IP:9100. Use the PC running print-bridge (e.g. http://127.0.0.1:39100). Put printer IP only in Network printers.",
    };
  }

  if (parsed.pathname.replace(/\/$/, "") === "/print") {
    return {
      ok: false,
      message: "Use the bridge base URL only (e.g. http://127.0.0.1:39100), without /print",
    };
  }

  return { ok: true, message: "Bridge URL looks valid" };
}

/** True when URL points at this machine (only the PC running print-bridge can ping it). */
export function isLoopbackPrintBridgeUrl(bridgeUrl: string): boolean {
  try {
    const host = new URL(bridgeUrl.trim()).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]" ||
      host === "0.0.0.0"
    );
  } catch {
    return false;
  }
}

export async function pingPrinter(
  bridgeUrl: string,
  printer: { host: string; port: string | number },
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const check = validatePrintBridgeUrl(bridgeUrl);
  if (!check.ok) return { ok: false, error: check.message };

  const base = bridgeUrl.replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/ping-printer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ host: printer.host, port: Number(printer.port) || 9100 }),
    });
    if (!response.ok) {
      return { ok: false, error: `Bridge HTTP ${response.status}` };
    }
    const result = (await response.json().catch(() => null)) as {
      ok?: boolean;
      latencyMs?: number;
      error?: string;
    } | null;
    return {
      ok: result?.ok === true,
      latencyMs: typeof result?.latencyMs === "number" ? result.latencyMs : undefined,
      error: result?.ok ? undefined : (result?.error ?? "Printer unreachable"),
    };
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError"
        ? true
        : error instanceof Error && /aborted|timeout/i.test(error.message);
    return {
      ok: false,
      error: timedOut
        ? "Ping timed out"
        : error instanceof Error
          ? error.message
          : "Ping failed",
    };
  }
}

export async function scanLanPrinters(
  bridgeUrl: string,
  port = 9100,
): Promise<{ ok: boolean; found: Array<{ host: string; port: number; latencyMs: number }>; error?: string }> {
  const check = validatePrintBridgeUrl(bridgeUrl);
  if (!check.ok) return { ok: false, found: [], error: check.message };

  const base = bridgeUrl.replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/scan-printers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ port }),
    });
    if (!response.ok) {
      return { ok: false, found: [], error: `Bridge HTTP ${response.status}` };
    }
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      found?: Array<{ host: string; port: number; latencyMs: number }>;
      error?: string;
    } | null;
    if (!payload?.ok) {
      return { ok: false, found: [], error: payload?.error || "Scan failed" };
    }
    return { ok: true, found: payload.found ?? [] };
  } catch (error) {
    return {
      ok: false,
      found: [],
      error: error instanceof Error ? error.message : "Scan failed",
    };
  }
}

export async function pingPrintBridge(bridgeUrl: string): Promise<{ ok: boolean; message: string }> {
  const check = validatePrintBridgeUrl(bridgeUrl);
  if (!check.ok) return check;

  const base = bridgeUrl.replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(BRIDGE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, message: `Bridge HTTP ${response.status}` };
    }
    const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;
    if (payload?.ok === false) {
      return { ok: false, message: "Bridge reported unhealthy" };
    }
    return { ok: true, message: "Print bridge OK" };
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError"
        ? true
        : error instanceof Error && /aborted|timeout/i.test(error.message);
    return {
      ok: false,
      message:
        (timedOut
          ? "Bridge timed out"
          : error instanceof Error
            ? error.message
            : "Bridge unreachable") + " — start: node print-bridge/server.mjs",
    };
  }
}

async function sendRawToPrinter(
  bridgeUrl: string,
  printer: NetworkPrinter,
  data: Uint8Array,
): Promise<void> {
  const check = validatePrintBridgeUrl(bridgeUrl);
  if (!check.ok) {
    throw new Error(check.message);
  }

  const base = bridgeUrl.replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(BRIDGE_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        host: printer.host,
        port: Number(printer.port) || 9100,
        dataBase64: bytesToBase64(data),
        printerName: printer.name,
      }),
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError"
        ? true
        : error instanceof Error && /aborted|timeout/i.test(error.message);
    throw new Error(
      timedOut
        ? "Print bridge timed out — is POS-Print-Bridge running?"
        : error instanceof Error
          ? error.message
          : "Print bridge unreachable",
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Print bridge error ${response.status}`);
  }
}

/**
 * Send ESC/POS bytes to all enabled printers for a role via the local bridge.
 * Runs all targets independently so a failure on one printer never blocks another.
 */
export async function silentPrintEscPos(
  settings: PrintDispatchSettings,
  role: PrinterRole,
  data: Uint8Array,
  options?: { onlyPrinterIds?: string[] },
): Promise<SilentPrintResult> {
  return silentPrintEscPosPerPrinter(settings, role, () => data, options);
}

type EscPosPayloadResolver = (
  printer: NetworkPrinter,
) => Uint8Array | null | undefined | Promise<Uint8Array | null | undefined>;

/**
 * Send per-printer ESC/POS via bridge — e.g. bitmap for legacy IP, text for modern IP.
 */
export async function silentPrintEscPosPerPrinter(
  settings: PrintDispatchSettings,
  role: PrinterRole,
  resolvePayload: EscPosPayloadResolver,
  options?: { onlyPrinterIds?: string[] },
): Promise<SilentPrintResult> {
  if (!settings.silentPrintEnabled) {
    return { sent: false, succeededPrinterIds: [], failedPrinters: [] };
  }

  const check = validatePrintBridgeUrl(settings.printBridgeUrl);
  if (!check.ok) {
    return { sent: false, succeededPrinterIds: [], failedPrinters: [], error: check.message };
  }

  let targets = printersForRoleFromSettings(settings, role);
  if (options?.onlyPrinterIds && options.onlyPrinterIds.length > 0) {
    const allowed = new Set(options.onlyPrinterIds);
    targets = targets.filter((p) => allowed.has(p.id));
  }
  if (targets.length === 0) {
    return {
      sent: false,
      succeededPrinterIds: [],
      failedPrinters: [],
      error: "No enabled printers for this role",
    };
  }

  // Deduplicate printers by host:port endpoint to prevent duplicate printing to the same physical printer
  const seenEndpoints = new Set<string>();
  const uniqueTargets: NetworkPrinter[] = [];
  for (const printer of targets) {
    const host = (printer.host || "").trim().toLowerCase();
    const port = Number(printer.port) || 9100;
    const endpoint = `${host}:${port}`;
    if (!host || seenEndpoints.has(endpoint)) continue;
    seenEndpoints.add(endpoint);
    uniqueTargets.push(printer);
  }

  const succeededPrinterIds: string[] = [];
  const failedPrinters: PrinterSendFailure[] = [];

  await Promise.all(
    uniqueTargets.map(async (printer) => {
      try {
        const payload = await resolvePayload(printer);
        if (!payload || payload.length === 0) {
          failedPrinters.push({
            id: printer.id,
            name: printer.name,
            host: printer.host,
            error: "No print payload",
          });
          return;
        }
        await sendRawToPrinter(settings.printBridgeUrl, printer, payload);
        succeededPrinterIds.push(printer.id);
      } catch (error) {
        failedPrinters.push({
          id: printer.id,
          name: printer.name,
          host: printer.host,
          error: error instanceof Error ? error.message : "Print failed",
        });
      }
    }),
  );

  const error =
    failedPrinters.length > 0
      ? failedPrinters.map((f) => `${f.name} (${f.host}): ${f.error}`).join("; ")
      : undefined;

  return {
    sent: succeededPrinterIds.length > 0,
    succeededPrinterIds,
    failedPrinters,
    error,
  };
}

export { printerUsesLegacyBitmap };
