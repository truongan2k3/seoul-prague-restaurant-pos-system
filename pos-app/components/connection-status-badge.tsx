"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Printer, Wifi, WifiOff, X } from "lucide-react";
import {
  CONNECTION_STATUS_LABELS,
  type ConnectionStatus,
} from "@/lib/connection-status";
import { useConnectionStatus } from "@/contexts/connection-status-context";
import { useSettings } from "@/contexts/settings-context";
import {
  pingPrintBridge,
  validatePrintBridgeUrl,
} from "@/src/lib/print-bridge-client";

type BridgeStatus = "checking" | "online" | "offline" | "off" | "invalid";

const BRIDGE_POLL_MS = 12_000;
const NETWORK_ALERT_COOLDOWN_MS = 60_000;
const BRIDGE_ALERT_COOLDOWN_MS = 45_000;

const HIDDEN_PATH_PREFIXES = [
  "/login",
  "/register",
  "/status",
  "/reservation",
  "/landing",
  "/menu",
  "/admin",
] as const;

function shouldHideBadge(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname === "/") return true;
  return HIDDEN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function networkBadgeClass(status: ConnectionStatus): string {
  if (status === "online") {
    return "border-emerald-200/80 bg-emerald-50/95 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/90 dark:text-emerald-200";
  }
  if (status === "no-network") {
    return "border-rose-200/80 bg-rose-50/95 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/90 dark:text-rose-200";
  }
  return "border-amber-200/80 bg-amber-50/95 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/90 dark:text-amber-200";
}

function bridgeBadgeClass(status: BridgeStatus): string {
  if (status === "online") {
    return "border-sky-200/80 bg-sky-50/95 text-sky-900 dark:border-sky-800/60 dark:bg-sky-950/90 dark:text-sky-200";
  }
  if (status === "offline" || status === "invalid") {
    return "border-rose-200/80 bg-rose-50/95 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/90 dark:text-rose-200";
  }
  return "border-stone-200/80 bg-white/95 text-stone-600 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-300";
}

function bridgeLabel(status: BridgeStatus): string {
  switch (status) {
    case "online":
      return "Online";
    case "offline":
      return "Offline";
    case "invalid":
      return "Config";
    case "checking":
      return "…";
    default:
      return "Off";
  }
}

/**
 * Top-right status strip on POS pages — clear of bottom FABs / sticky bars.
 * Online/Offline + Printer bridge; modal when network or bridge fails.
 */
export function ConnectionStatusBadge() {
  const pathname = usePathname();
  const { status } = useConnectionStatus();
  const { settings } = useSettings();

  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("off");
  const [bridgeDetail, setBridgeDetail] = useState<string | null>(null);
  const [networkAlert, setNetworkAlert] = useState<string | null>(null);
  const [bridgeAlert, setBridgeAlert] = useState<string | null>(null);

  const lastNetworkAlertAt = useRef(0);
  const lastBridgeAlertAt = useRef(0);
  const prevNetworkStatus = useRef<ConnectionStatus | null>(null);
  const prevBridgeStatus = useRef<BridgeStatus | null>(null);

  const silentPrint = settings.silentPrintEnabled;
  const bridgeUrl = settings.printBridgeUrl?.trim() ?? "";
  const hidden = shouldHideBadge(pathname);

  const checkBridge = useCallback(async () => {
    if (!silentPrint) {
      setBridgeStatus("off");
      setBridgeDetail(null);
      return;
    }
    if (!bridgeUrl) {
      setBridgeStatus("invalid");
      setBridgeDetail("Chưa cấu hình địa chỉ Print Bridge trong Settings.");
      return;
    }
    const validation = validatePrintBridgeUrl(bridgeUrl);
    if (!validation.ok) {
      setBridgeStatus("invalid");
      setBridgeDetail(validation.message);
      return;
    }

    setBridgeStatus((prev) => (prev === "online" || prev === "offline" ? prev : "checking"));
    const result = await pingPrintBridge(bridgeUrl);
    if (result.ok) {
      setBridgeStatus("online");
      setBridgeDetail(null);
      return;
    }
    setBridgeStatus("offline");
    setBridgeDetail(result.message);
  }, [silentPrint, bridgeUrl]);

  useEffect(() => {
    if (hidden) return;
    void checkBridge();
    if (!silentPrint) return;
    const id = window.setInterval(() => {
      void checkBridge();
    }, BRIDGE_POLL_MS);
    return () => window.clearInterval(id);
  }, [checkBridge, silentPrint, hidden]);

  // Network lost → popup (cooldown)
  useEffect(() => {
    if (hidden) return;
    const prev = prevNetworkStatus.current;
    prevNetworkStatus.current = status;
    if (status !== "no-network") return;
    if (prev === "no-network") return;
    const now = Date.now();
    if (now - lastNetworkAlertAt.current < NETWORK_ALERT_COOLDOWN_MS) return;
    lastNetworkAlertAt.current = now;
    setNetworkAlert(
      "Mất kết nối mạng. Đơn và đồng bộ có thể bị treo — kiểm tra Wi‑Fi / dây mạng.",
    );
  }, [status, hidden]);

  // Bridge config / reachability failure → popup
  useEffect(() => {
    if (hidden) return;
    const prev = prevBridgeStatus.current;
    prevBridgeStatus.current = bridgeStatus;
    if (bridgeStatus !== "offline" && bridgeStatus !== "invalid") return;
    if (prev === bridgeStatus) return;
    const now = Date.now();
    if (now - lastBridgeAlertAt.current < BRIDGE_ALERT_COOLDOWN_MS) return;
    lastBridgeAlertAt.current = now;
    const title =
      bridgeStatus === "invalid"
        ? "Print Bridge cấu hình lỗi"
        : "Print Bridge offline";
    const body =
      bridgeDetail ??
      (bridgeStatus === "invalid"
        ? "URL bridge không hợp lệ hoặc thiếu cấu hình."
        : "Không kết nối được tới máy in / bridge. Kiểm tra print-bridge đang chạy.");
    setBridgeAlert(`${title}: ${body}`);
  }, [bridgeStatus, bridgeDetail, hidden]);

  if (hidden) return null;

  const NetworkIcon = status === "online" ? Wifi : WifiOff;

  return (
    <>
      <div
        className="pointer-events-none fixed right-3 top-3 z-[80] flex max-w-[min(18rem,calc(100vw-1.5rem))] flex-col items-end gap-1.5 sm:right-4 sm:top-4"
        role="status"
        aria-live="polite"
      >
        <div
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold shadow-sm backdrop-blur-sm ${networkBadgeClass(status)}`}
          title={CONNECTION_STATUS_LABELS[status]}
        >
          <NetworkIcon className="size-3.5 shrink-0" aria-hidden />
          <span>{CONNECTION_STATUS_LABELS[status]}</span>
        </div>

        <div
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold shadow-sm backdrop-blur-sm ${bridgeBadgeClass(bridgeStatus)}`}
          title={bridgeDetail ?? `Printer: ${bridgeLabel(bridgeStatus)}`}
        >
          <Printer className="size-3.5 shrink-0" aria-hidden />
          <span>Printer: {bridgeLabel(bridgeStatus)}</span>
          {(bridgeStatus === "offline" || bridgeStatus === "invalid") && (
            <span className="size-1.5 shrink-0 rounded-full bg-rose-500" aria-hidden />
          )}
        </div>
      </div>

      {(networkAlert || bridgeAlert) && (
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center bg-black/35 p-4 pt-[max(4.5rem,12vh)] sm:items-center sm:pt-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="pos-status-alert-title"
        >
          <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <AlertTriangle className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="pos-status-alert-title"
                  className="text-base font-semibold text-stone-900 dark:text-zinc-50"
                >
                  {networkAlert ? "Mất kết nối mạng" : "Lỗi Print Bridge"}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-600 dark:text-zinc-300">
                  {networkAlert ?? bridgeAlert}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 dark:hover:bg-zinc-800"
                aria-label="Đóng"
                onClick={() => {
                  if (networkAlert) setNetworkAlert(null);
                  else setBridgeAlert(null);
                }}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {bridgeAlert && !networkAlert ? (
                <button
                  type="button"
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  onClick={() => {
                    void checkBridge();
                  }}
                >
                  Thử lại
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                onClick={() => {
                  if (networkAlert) setNetworkAlert(null);
                  else setBridgeAlert(null);
                }}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
