import type { AppSettings, NetworkPrinter, PrinterRole } from "@/lib/types";
import { bytesToBase64 } from "@/src/lib/escpos";

export type PrintDispatchSettings = Pick<
  AppSettings,
  "silentPrintEnabled" | "printBridgeUrl" | "browserPrintFallback" | "printers"
>;

const RAW_PRINTER_PORTS = new Set([9100, 9101, 9102, 9103]);

function printersForRole(settings: PrintDispatchSettings, role: PrinterRole): NetworkPrinter[] {
  return (settings.printers ?? []).filter(
    (printer) => printer.enabled && printer.roles.includes(role),
  );
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

export async function pingPrintBridge(bridgeUrl: string): Promise<{ ok: boolean; message: string }> {
  const check = validatePrintBridgeUrl(bridgeUrl);
  if (!check.ok) return check;

  const base = bridgeUrl.replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/health`, { method: "GET" });
    if (!response.ok) {
      return { ok: false, message: `Bridge HTTP ${response.status}` };
    }
    const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;
    if (payload?.ok === false) {
      return { ok: false, message: "Bridge reported unhealthy" };
    }
    return { ok: true, message: "Print bridge OK" };
  } catch (error) {
    return {
      ok: false,
      message:
        (error instanceof Error ? error.message : "Bridge unreachable") +
        " — start: node print-bridge/server.mjs",
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
  const response = await fetch(`${base}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      host: printer.host,
      port: Number(printer.port) || 9100,
      dataBase64: bytesToBase64(data),
      printerName: printer.name,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Print bridge error ${response.status}`);
  }
}

/**
 * Send ESC/POS bytes to all enabled printers for a role via the local bridge.
 * Returns true if at least one printer succeeded.
 */
export async function silentPrintEscPos(
  settings: PrintDispatchSettings,
  role: PrinterRole,
  data: Uint8Array,
): Promise<{ sent: boolean; error?: string }> {
  if (!settings.silentPrintEnabled) {
    return { sent: false };
  }

  const check = validatePrintBridgeUrl(settings.printBridgeUrl);
  if (!check.ok) {
    return { sent: false, error: check.message };
  }

  const targets = printersForRole(settings, role);
  if (targets.length === 0) {
    return { sent: false, error: "No enabled printers for this role" };
  }

  const errors: string[] = [];
  let sent = false;

  for (const printer of targets) {
    try {
      await sendRawToPrinter(settings.printBridgeUrl, printer, data);
      sent = true;
    } catch (error) {
      errors.push(
        `${printer.name}: ${error instanceof Error ? error.message : "print failed"}`,
      );
    }
  }

  return { sent, error: errors.length > 0 ? errors.join("; ") : undefined };
}
