"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Printer, Wifi, WifiOff, X } from "lucide-react";
import {
  CONNECTION_STATUS_LABELS,
  type ConnectionStatus,
} from "@/lib/connection-status";
import { useConnectionStatus } from "@/contexts/connection-status-context";
import { useSettings } from "@/contexts/settings-context";
import { LiveClock } from "@/components/live-clock";
import { isPosMainPath, isStationPath } from "@/lib/page-routes";
import {
  isPrintBridgePresenceFresh,
  startPrintBridgePresencePublisher,
  subscribePrintBridgePresence,
  type PrintBridgePresencePayload,
} from "@/lib/print-bridge-presence";
import {
  isPageOnline,
  subscribeToPagePresence,
  type PagePresencePayload,
} from "@/lib/pos-page-presence";
import {
  isLoopbackPrintBridgeUrl,
  pingPrintBridge,
  validatePrintBridgeUrl,
} from "@/src/lib/print-bridge-client";

type BridgeStatus = "checking" | "online" | "offline" | "off" | "invalid";

const BRIDGE_POLL_MS = 12_000;
const NETWORK_ALERT_COOLDOWN_MS = 60_000;
const BRIDGE_ALERT_COOLDOWN_MS = 45_000;
const STATION_ALERT_COOLDOWN_MS = 60_000;
const SHARED_STALE_CHECK_MS = 5_000;
/** Wait before warning that Print Station tab is missing (avoid false alarm on boot). */
const STATION_GRACE_MS = 25_000;
const PRINT_BRIDGE_PROTOCOL = "pos-print-bridge://start";

const HIDDEN_PATH_PREFIXES = [
  "/login",
  "/register",
  "/status",
  "/reservation",
  "/landing",
  "/menu",
  "/admin",
] as const;

function shouldHideOnPath(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname === "/") return true;
  return HIDDEN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function networkBadgeClass(status: ConnectionStatus): string {
  if (status === "online") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950 dark:text-emerald-200";
  }
  if (status === "no-network") {
    return "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800/70 dark:bg-rose-950 dark:text-rose-200";
  }
  return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950 dark:text-amber-200";
}

function bridgeBadgeClass(status: BridgeStatus): string {
  if (status === "online") {
    return "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800/70 dark:bg-sky-950 dark:text-sky-200";
  }
  if (status === "offline" || status === "invalid") {
    return "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800/70 dark:bg-rose-950 dark:text-rose-200";
  }
  return "border-stone-200 bg-stone-50 text-stone-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
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

interface PrintBridgeStatusValue {
  bridgeStatus: BridgeStatus;
  bridgeDetail: string | null;
  /** True when this device is the one that can reach the bridge (PC). */
  isBridgeHost: boolean;
  checkBridge: () => Promise<void>;
  /** null = not watching / unknown yet */
  printStationOnline: boolean | null;
}

const PrintBridgeStatusContext = createContext<PrintBridgeStatusValue | null>(null);

/**
 * Polls print-bridge on the PC; broadcasts health so tablets inherit Printer: Online.
 * Status chips render in page headers via {@link PosStatusChips}.
 */
export function ConnectionStatusBadge({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const { status } = useConnectionStatus();
  const { settings } = useSettings();

  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("off");
  const [bridgeDetail, setBridgeDetail] = useState<string | null>(null);
  const [isBridgeHost, setIsBridgeHost] = useState(false);
  const [sharedPresence, setSharedPresence] =
    useState<PrintBridgePresencePayload | null>(null);
  const [networkAlert, setNetworkAlert] = useState<string | null>(null);
  const [bridgeAlert, setBridgeAlert] = useState<string | null>(null);
  const [stationAlert, setStationAlert] = useState<string | null>(null);
  const [printStationOnline, setPrintStationOnline] = useState<boolean | null>(null);

  const lastNetworkAlertAt = useRef(0);
  const lastBridgeAlertAt = useRef(0);
  const lastStationAlertAt = useRef(0);
  const prevNetworkStatus = useRef<ConnectionStatus | null>(null);
  const prevBridgeStatus = useRef<BridgeStatus | null>(null);
  const prevStationOnline = useRef<boolean | null>(null);
  const stationMountedAt = useRef(Date.now());
  const localOnlineRef = useRef(false);
  const localDetailRef = useRef<string | undefined>(undefined);

  const silentPrint = settings.silentPrintEnabled;
  const viaStation = settings.kitchenPrintViaStation;
  const bridgeUrl = settings.printBridgeUrl?.trim() ?? "";
  const hidden = shouldHideOnPath(pathname);
  const onMain = Boolean(pathname && isPosMainPath(pathname));
  const onStation = Boolean(pathname && isStationPath(pathname));
  const loopback = Boolean(bridgeUrl && isLoopbackPrintBridgeUrl(bridgeUrl));
  const watchPrintStation = onMain && !hidden && viaStation;

  const applySharedPresence = useCallback((payload: PrintBridgePresencePayload | null) => {
    if (localOnlineRef.current) return;
    if (!payload || !isPrintBridgePresenceFresh(payload.at)) {
      if (!localOnlineRef.current && loopback) {
        setBridgeStatus((prev) => (prev === "off" || prev === "invalid" ? prev : "offline"));
        setBridgeDetail(
          payload?.detail ??
            "Chưa nhận heartbeat từ máy PC chạy print-bridge.",
        );
        setIsBridgeHost(false);
      }
      return;
    }
    if (payload.online) {
      setBridgeStatus("online");
      setBridgeDetail(
        payload.detail ?? "Đồng bộ từ máy PC (print-bridge).",
      );
      setIsBridgeHost(false);
      return;
    }
    setBridgeStatus("offline");
    setBridgeDetail(payload.detail ?? "Print bridge offline trên máy PC.");
    setIsBridgeHost(false);
  }, [loopback]);

  const checkBridge = useCallback(async () => {
    if (!silentPrint) {
      localOnlineRef.current = false;
      setBridgeStatus("off");
      setBridgeDetail(null);
      setIsBridgeHost(false);
      return;
    }
    if (!bridgeUrl) {
      localOnlineRef.current = false;
      setBridgeStatus("invalid");
      setBridgeDetail("Chưa cấu hình địa chỉ Print Bridge trong Settings.");
      setIsBridgeHost(false);
      return;
    }
    const validation = validatePrintBridgeUrl(bridgeUrl);
    if (!validation.ok) {
      localOnlineRef.current = false;
      setBridgeStatus("invalid");
      setBridgeDetail(validation.message);
      setIsBridgeHost(false);
      return;
    }

    setBridgeStatus((prev) => (prev === "online" || prev === "offline" ? prev : "checking"));
    const result = await pingPrintBridge(bridgeUrl);

    if (result.ok) {
      localOnlineRef.current = true;
      localDetailRef.current = result.message;
      setIsBridgeHost(true);
      setBridgeStatus("online");
      setBridgeDetail(null);
      return;
    }

    localOnlineRef.current = false;
    localDetailRef.current = result.message;

    // Loopback URL failed → this device is not the PC; use shared heartbeat.
    if (isLoopbackPrintBridgeUrl(bridgeUrl)) {
      setIsBridgeHost(false);
      applySharedPresence(sharedPresence);
      return;
    }

    // LAN bridge URL: every device can ping the PC directly.
    setIsBridgeHost(true);
    setBridgeStatus("offline");
    setBridgeDetail(result.message);
  }, [silentPrint, bridgeUrl, applySharedPresence, sharedPresence]);

  // Tablets subscribe; the PC (bridge host) only publishes to avoid same-client channel clash.
  useEffect(() => {
    if (hidden || !onMain || !silentPrint) return;
    if (isBridgeHost) return;
    return subscribePrintBridgePresence((payload) => {
      setSharedPresence(payload);
      applySharedPresence(payload);
    });
  }, [hidden, onMain, silentPrint, applySharedPresence, isBridgeHost]);

  // Stale shared heartbeat cleanup (tablets only).
  useEffect(() => {
    if (hidden || !onMain || !silentPrint || isBridgeHost) return;
    const id = window.setInterval(() => {
      if (localOnlineRef.current) return;
      applySharedPresence(sharedPresence);
    }, SHARED_STALE_CHECK_MS);
    return () => window.clearInterval(id);
  }, [hidden, onMain, silentPrint, isBridgeHost, sharedPresence, applySharedPresence]);

  // PC publishes while it is the bridge host.
  useEffect(() => {
    if (hidden || !onMain || !silentPrint) return;
    if (!isBridgeHost) return;
    return startPrintBridgePresencePublisher(() => ({
      online: localOnlineRef.current,
      detail: localDetailRef.current,
    }));
  }, [hidden, onMain, silentPrint, isBridgeHost]);

  useEffect(() => {
    if (hidden || !onMain) return;
    void checkBridge();
    if (!silentPrint) return;
    const id = window.setInterval(() => {
      void checkBridge();
    }, BRIDGE_POLL_MS);
    return () => window.clearInterval(id);
  }, [checkBridge, silentPrint, hidden, onMain]);

  useEffect(() => {
    if (hidden || onStation) return;
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
  }, [status, hidden, onStation]);

  // Bridge popups only on the bridge host (PC), not on tablets inheriting status.
  useEffect(() => {
    if (hidden || !onMain || !isBridgeHost) return;
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
        : "Print Bridge chưa chạy";
    const body =
      bridgeDetail ??
      (bridgeStatus === "invalid"
        ? "URL bridge không hợp lệ hoặc thiếu cấu hình."
        : "Chưa thấy print-bridge trên PC. Chạy start-bridge.bat (hoặc shortcut Desktop / nút Start bridge).");
    setBridgeAlert(`${title}: ${body}`);
  }, [bridgeStatus, bridgeDetail, hidden, onMain, isBridgeHost]);

  // Print Station tab presence (when kitchen print goes via station).
  const stationLastSeenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!watchPrintStation) {
      setPrintStationOnline(null);
      stationLastSeenRef.current = null;
      return;
    }
    stationMountedAt.current = Date.now();
    prevStationOnline.current = null;
    stationLastSeenRef.current = null;
    setPrintStationOnline(null);

    const unsub = subscribeToPagePresence((payload: PagePresencePayload) => {
      if (payload.page !== "print-station") return;
      stationLastSeenRef.current = payload.at;
      setPrintStationOnline(isPageOnline(payload.at));
    });

    const staleTimer = window.setInterval(() => {
      const at = stationLastSeenRef.current;
      if (!at) {
        if (Date.now() - stationMountedAt.current >= STATION_GRACE_MS) {
          setPrintStationOnline(false);
        }
        return;
      }
      setPrintStationOnline(isPageOnline(at));
    }, SHARED_STALE_CHECK_MS);

    const graceTimer = window.setTimeout(() => {
      setPrintStationOnline((prev) => (prev == null ? false : prev));
    }, STATION_GRACE_MS);

    return () => {
      unsub();
      window.clearInterval(staleTimer);
      window.clearTimeout(graceTimer);
    };
  }, [watchPrintStation]);

  useEffect(() => {
    if (!watchPrintStation || printStationOnline !== false) return;
    const prev = prevStationOnline.current;
    prevStationOnline.current = printStationOnline;
    if (prev === false) return;
    const now = Date.now();
    if (now - lastStationAlertAt.current < STATION_ALERT_COOLDOWN_MS) return;
    lastStationAlertAt.current = now;
    setStationAlert(
      "Tab Print Station chưa mở (hoặc đã đóng) trên PC. Kitchen ticket cần tab /print-station luôn mở.",
    );
  }, [watchPrintStation, printStationOnline]);

  const openPrintStation = useCallback(() => {
    window.open("/print-station", "_blank", "noopener,noreferrer");
  }, []);

  const startBridgeViaProtocol = useCallback(() => {
    // Requires register-start-protocol.bat once on the PC.
    window.location.href = PRINT_BRIDGE_PROTOCOL;
  }, []);

  const value = useMemo(
    () => ({
      bridgeStatus,
      bridgeDetail,
      isBridgeHost,
      checkBridge,
      printStationOnline,
    }),
    [bridgeStatus, bridgeDetail, isBridgeHost, checkBridge, printStationOnline],
  );

  const showAlert = Boolean(!hidden && !onStation && (networkAlert || bridgeAlert || stationAlert));
  const alertTitle = networkAlert
    ? "Mất kết nối mạng"
    : bridgeAlert && stationAlert
      ? "Print Bridge & Print Station"
      : bridgeAlert
        ? "Lỗi Print Bridge"
        : "Print Station chưa mở";
  const alertBody = [networkAlert, bridgeAlert, stationAlert].filter(Boolean).join("\n\n");

  return (
    <PrintBridgeStatusContext.Provider value={value}>
      {children}
      {showAlert ? (
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
                  {alertTitle}
                </h2>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-stone-600 dark:text-zinc-300">
                  {alertBody}
                </p>
                {(bridgeAlert || stationAlert) && !networkAlert ? (
                  <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-relaxed text-stone-500 dark:text-zinc-400">
                    {bridgeAlert ? (
                      <li>
                        Bridge: chạy <code className="rounded bg-stone-100 px-1 dark:bg-zinc-800">start-bridge.bat</code>{" "}
                        (hoặc shortcut Desktop / nút Start bridge bên dưới).
                      </li>
                    ) : null}
                    {stationAlert ? (
                      <li>Print Station: mở tab trên cùng PC Windows và giữ mở suốt ca.</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
              <button
                type="button"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 dark:hover:bg-zinc-800"
                aria-label="Đóng"
                onClick={() => {
                  setNetworkAlert(null);
                  setBridgeAlert(null);
                  setStationAlert(null);
                }}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {stationAlert && !networkAlert ? (
                <button
                  type="button"
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                  onClick={() => {
                    openPrintStation();
                    setStationAlert(null);
                  }}
                >
                  Mở Print Station
                </button>
              ) : null}
              {bridgeAlert && !networkAlert && isBridgeHost ? (
                <button
                  type="button"
                  className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
                  onClick={() => {
                    startBridgeViaProtocol();
                    window.setTimeout(() => {
                      void checkBridge();
                    }, 1500);
                  }}
                >
                  Start bridge
                </button>
              ) : null}
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
                  setNetworkAlert(null);
                  setBridgeAlert(null);
                  setStationAlert(null);
                }}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PrintBridgeStatusContext.Provider>
  );
}

/** Inline Online + Printer chips for main POS top bars — desktop only (mobile uses sidebar icons). */
export function PosStatusChips({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const { status } = useConnectionStatus();
  const bridge = useContext(PrintBridgeStatusContext);

  if (shouldHideOnPath(pathname) || !bridge) return null;
  if (pathname && isStationPath(pathname)) return null;

  const showPrinter = Boolean(pathname && isPosMainPath(pathname));
  const { bridgeStatus, bridgeDetail } = bridge;
  const NetworkIcon = status === "online" ? Wifi : WifiOff;

  return (
    <div
      className={`hidden flex-nowrap items-center gap-1 lg:flex ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none sm:text-[11px] ${networkBadgeClass(status)}`}
        title={CONNECTION_STATUS_LABELS[status]}
      >
        <NetworkIcon className="size-3 shrink-0" aria-hidden />
        <span className="whitespace-nowrap">{CONNECTION_STATUS_LABELS[status]}</span>
      </span>
      {showPrinter ? (
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none sm:text-[11px] ${bridgeBadgeClass(bridgeStatus)}`}
          title={bridgeDetail ?? `Printer: ${bridgeLabel(bridgeStatus)}`}
        >
          <Printer className="size-3 shrink-0" aria-hidden />
          <span className="whitespace-nowrap">Printer: {bridgeLabel(bridgeStatus)}</span>
        </span>
      ) : null}
    </div>
  );
}

function networkIconShell(status: ConnectionStatus): string {
  if (status === "online") {
    return "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300";
  }
  if (status === "no-network") {
    return "bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300";
  }
  return "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300";
}

function bridgeIconShell(status: BridgeStatus): string {
  if (status === "online") {
    return "bg-sky-500/15 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300";
  }
  if (status === "offline" || status === "invalid") {
    return "bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300";
  }
  return "bg-stone-500/10 text-stone-500 dark:bg-zinc-700/50 dark:text-zinc-400";
}

/** Icon-only Online + Printer for the mobile left sidebar rail. */
export function SidebarStatusIcons({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const { status } = useConnectionStatus();
  const bridge = useContext(PrintBridgeStatusContext);

  if (shouldHideOnPath(pathname) || !bridge) return null;
  if (pathname && isStationPath(pathname)) return null;

  const showPrinter = Boolean(pathname && isPosMainPath(pathname));
  const { bridgeStatus, bridgeDetail } = bridge;
  const NetworkIcon = status === "online" ? Wifi : WifiOff;
  const printerTitle =
    bridgeDetail ?? `Printer: ${bridgeLabel(bridgeStatus)}`;

  return (
    <div
      className={`flex flex-col items-center gap-1.5 lg:hidden ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${networkIconShell(status)}`}
        title={CONNECTION_STATUS_LABELS[status]}
        aria-label={CONNECTION_STATUS_LABELS[status]}
      >
        <NetworkIcon className="h-4 w-4" aria-hidden />
      </span>
      {showPrinter ? (
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${bridgeIconShell(bridgeStatus)}`}
          title={printerTitle}
          aria-label={printerTitle}
        >
          <Printer className="h-4 w-4" aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

/** Clock (desktop) + status chips (desktop). Mobile status lives in the sidebar. */
export function HeaderClockWithStatus({
  clockClassName,
  className = "",
}: {
  clockClassName?: string;
  className?: string;
}) {
  // Custom className (e.g. station boards) keeps the plain inline clock.
  const clockVariant = clockClassName ? "plain" : "header";

  return (
    <div
      className={`flex flex-nowrap items-center justify-end gap-2 sm:gap-3 ${className}`}
    >
      <LiveClock variant={clockVariant} className={clockClassName} />
      <PosStatusChips />
    </div>
  );
}
