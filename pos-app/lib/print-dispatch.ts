import type { AppSettings, NetworkPrinter, PrinterRole } from "@/lib/types";

export function formatPrinterEndpoint(printer: NetworkPrinter): string {
  const port = printer.port?.trim() || "9100";
  return `${printer.host}:${port}`;
}

export function printersForRole(
  printers: NetworkPrinter[] | undefined,
  role: PrinterRole,
): NetworkPrinter[] {
  return (printers ?? []).filter((printer) => printer.enabled && printer.roles.includes(role));
}

/** Per-printer toggle: rasterize text before bridge/ESC/POS (fixes garbled fonts on old thermals). */
export function printerUsesLegacyBitmap(printer: NetworkPrinter): boolean {
  return printer.legacyBitmap === true;
}

export function roleUsesLegacyBitmap(
  printers: NetworkPrinter[] | undefined,
  role: PrinterRole,
): boolean {
  return printersForRole(printers, role).some((printer) => printerUsesLegacyBitmap(printer));
}

/** Browser receipt print — bitmap if any receipt-role printer is marked legacy. */
export function receiptShouldUseBitmap(
  settings: Pick<AppSettings, "receiptPrintBitmap" | "printers">,
): boolean {
  if (settings.receiptPrintBitmap) return true;
  return roleUsesLegacyBitmap(settings.printers, "receipt");
}
