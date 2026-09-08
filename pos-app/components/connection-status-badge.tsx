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
const SHARED_STALE_CHECK_MS = 5_000;
/** Wait before treating missing Print Station heartbeat as offline. */
const STATION_GRACE_MS = 20_000;

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

function printerTitle(status: BridgeStatus, detail: string | null): string {
  if (detail) return detail;
  return `Printer: ${bridgeLabel(status)}`;
}

interface PrintBridgeStatusValue {
  bridgeStatus: BridgeStatus;
  bridgeDetail: string | null;
  /** True when this device can reach the local print-bridge. */
  isBridgeHost: boolean;
  checkBridge: () => Promise<void>;
}

const PrintBridgeStatusContext = createContext<PrintBridgeStatusValue | null>(null);

/**
 * Polls print-bridge + Print Station presence on the host PC; broadcasts combined
 * Printer Online/Offline so tablets inherit the same chip (no popups).
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
  const [printStationOnline, setPrintStationOnline] = useState<boolean | null>(null);
  const [localBridgeOk, setLocalBridgeOk] = useState(false);

  const lastNetworkAlertAt = useRef(0);
  const prevNetworkStatus = useRef<ConnectionStatus | null>(null);
  const stationMountedAt = useRef(Date.now());
  const stationLastSeenRef = useRef<string | null>(null);
  const localOnlineRef = useRef(false);
  const localDetailRef = useRef<string | undefined>(undefined);
  const stationOnlineRef = useRef<boolean | null>(null);

  const silentPrint = settings.silentPrintEnabled;
  const viaStation = settings.kitchenPrintViaStation;
  const bridgeUrl = settings.printBridgeUrl?.trim() ?? "";
  const hidden = shouldHideOnPath(pathname);
  const onMain = Boolean(pathname && isPosMainPath(pathname));
  const onStation = Boolean(pathname && isStationPath(pathname));
  const onPrintStation = pathname === "/print-station" || Boolean(pathname?.startsWith("/print-station/"));
  const loopback = Boolean(bridgeUrl && isLoopbackPrintBridgeUrl(bridgeUrl));
  /** Watch Print Station heartbeats on main POS (and publish combined health). */
  const watchPrintStation = (onMain || onPrintStation) && !hidden && viaStation;
  const shouldMonitorPrinter = (onMain || onPrintStation) && !hidden && (silentPrint || viaStation);

  const resolveHostPrinterStatus = useCallback(
    (bridgeOk: boolean, stationOk: boolean | null): { status: BridgeStatus; detail: string | null } => {
      if (!silentPrint && !viaStation) {
        return { status: "off", detail: null };
      }
      if (silentPrint && !bridgeOk) {
        return {
          status: "offline",
          detail: "Print bridge chưa chạy trên PC.",
        };
      }
      if (viaStation && stationOk === false) {
        return {
          status: "offline",
          detail: "Tab Print Station chưa mở trên PC.",
        };
      }
      if (viaStation && stationOk == null) {
        return { status: "checking", detail: "Đang kiểm tra Print Station…" };
      }
      if (silentPrint && bridgeOk) {
        return { status: "online", detail: null };
      }
      if (!silentPrint && viaStation && stationOk) {
        return { status: "online", detail: "Print Station đang mở (silent print tắt)." };
      }
      return { status: "off", detail: null };
    },
    [silentPrint, viaStation],
  );

  const applySharedPresence = useCallback(
    (payload: PrintBridgePresencePayload | null) => {
      if (localOnlineRef.current) return;
      if (!payload || !isPrintBridgePresenceFresh(payload.at)) {
        if (!localOnlineRef.current && (loopback || viaStation || silentPrint)) {
          setBridgeStatus((prev) => (prev === "off" || prev === "invalid" ? prev : "offline"));
          setBridgeDetail(
            payload?.detail ??
              "Chưa nhận heartbeat từ máy PC (bridge + Print Station).",
          );
          setIsBridgeHost(false);
        }
        return;
      }
      if (payload.online) {
        setBridgeStatus("online");
        setBridgeDetail(payload.detail ?? "Đồng bộ từ máy PC (bridge + Print Station).");
        setIsBridgeHost(false);
        return;
      }
      setBridgeStatus("offline");
      setBridgeDetail(payload.detail ?? "Máy PC báo Printer Offline.");
      setIsBridgeHost(false);
    },
    [loopback, viaStation, silentPrint],
  );

  const publishReady = useCallback(() => {
    const stationOk = viaStation ? stationOnlineRef.current === true : true;
    const bridgeOk = silentPrint ? localOnlineRef.current : true;
    return bridgeOk && stationOk;
  }, [viaStation, silentPrint]);

  const refreshHostDisplay = useCallback(() => {
    if (!isBridgeHost && !onPrintStation) return;
    const resolved = resolveHostPrinterStatus(
      localOnlineRef.current || (!silentPrint && viaStation),
      viaStation ? stationOnlineRef.current : true,
    );
    // When silent print: bridge ok is localOnlineRef; when only viaStation without silent, ignore bridge.
    if (silentPrint) {
      const next = resolveHostPrinterStatus(localOnlineRef.current, viaStation ? stationOnlineRef.current : true);
      setBridgeStatus(next.status);
      setBridgeDetail(next.detail);
      localDetailRef.current = next.detail ?? undefined;
      return;
    }
    setBridgeStatus(resolved.status);
    setBridgeDetail(resolved.detail);
    localDetailRef.current = resolved.detail ?? undefined;
  }, [isBridgeHost, onPrintStation, resolveHostPrinterStatus, silentPrint, viaStation]);

  const checkBridge = useCallback(async () => {
    if (!shouldMonitorPrinter) {
      localOnlineRef.current = false;
      setLocalBridgeOk(false);
      setBridgeStatus("off");
      setBridgeDetail(null);
      setIsBridgeHost(false);
      return;
    }

    if (!silentPrint) {
      // Station-only mode: this device is still a "host" for presence if on PC print-station/main.
      localOnlineRef.current = false;
      setLocalBridgeOk(false);
      if (onMain || onPrintStation) {
        setIsBridgeHost(true);
        refreshHostDisplay();
      } else {
        setIsBridgeHost(false);
        applySharedPresence(sharedPresence);
      }
      return;
    }

    if (!bridgeUrl) {
      localOnlineRef.current = false;
      setLocalBridgeOk(false);
      setBridgeStatus("invalid");
      setBridgeDetail("Chưa cấu hình địa chỉ Print Bridge trong Settings.");
      setIsBridgeHost(false);
      return;
    }
    const validation = validatePrintBridgeUrl(bridgeUrl);
    if (!validation.ok) {
      localOnlineRef.current = false;
      setLocalBridgeOk(false);
      setBridgeStatus("invalid");
      setBridgeDetail(validation.message);
      setIsBridgeHost(false);
      return;
    }

    setBridgeStatus((prev) => (prev === "online" || prev === "offline" ? prev : "checking"));
    const result = await pingPrintBridge(bridgeUrl);

    if (result.ok) {
      localOnlineRef.current = true;
      setLocalBridgeOk(true);
      setIsBridgeHost(true);
      const next = resolveHostPrinterStatus(true, viaStation ? stationOnlineRef.current : true);
      setBridgeStatus(next.status);
      setBridgeDetail(next.detail);
      localDetailRef.current = next.detail ?? result.message;
      return;
    }

    localOnlineRef.current = false;
    setLocalBridgeOk(false);
    localDetailRef.current = result.message;

    if (isLoopbackPrintBridgeUrl(bridgeUrl) && !onPrintStation) {
      setIsBridgeHost(false);
      applySharedPresence(sharedPresence);
      return;
    }

    // Reachable URL failed, or print-station on PC with loopback fail → host offline.
    setIsBridgeHost(true);
    const next = resolveHostPrinterStatus(false, viaStation ? stationOnlineRef.current : true);
    setBridgeStatus(next.status === "checking" ? "offline" : next.status);
    setBridgeDetail(next.detail ?? result.message);
  }, [
    shouldMonitorPrinter,
    silentPrint,
    bridgeUrl,
    applySharedPresence,
    sharedPresence,
    onMain,
    onPrintStation,
    refreshHostDisplay,
    resolveHostPrinterStatus,
    viaStation,
  ]);

  // Follow host heartbeat on tablets / non-host main.
  useEffect(() => {
    if (hidden || !shouldMonitorPrinter) return;
    if (isBridgeHost) return;
    return subscribePrintBridgePresence((payload) => {
      setSharedPresence(payload);
      applySharedPresence(payload);
    });
  }, [hidden, shouldMonitorPrinter, applySharedPresence, isBridgeHost]);

  useEffect(() => {
    if (hidden || !shouldMonitorPrinter || isBridgeHost) return;
    const id = window.setInterval(() => {
      if (localOnlineRef.current) return;
      applySharedPresence(sharedPresence);
    }, SHARED_STALE_CHECK_MS);
    return () => window.clearInterval(id);
  }, [hidden, shouldMonitorPrinter, isBridgeHost, sharedPresence, applySharedPresence]);

  // Host publishes combined Printer ready (bridge + Print Station when required).
  useEffect(() => {
    if (hidden || !shouldMonitorPrinter) return;
    if (!isBridgeHost) return;
    return startPrintBridgePresencePublisher(() => ({
      online: publishReady(),
      detail: localDetailRef.current,
      bridgeOnline: silentPrint ? localOnlineRef.current : undefined,
      printStationOnline: viaStation ? stationOnlineRef.current === true : undefined,
    }));
  }, [hidden, shouldMonitorPrinter, isBridgeHost, publishReady, silentPrint, viaStation]);

  useEffect(() => {
    if (hidden || !shouldMonitorPrinter) return;
    void checkBridge();
    const id = window.setInterval(() => {
      void checkBridge();
    }, BRIDGE_POLL_MS);
    return () => window.clearInterval(id);
  }, [checkBridge, hidden, shouldMonitorPrinter]);

  // Print Station page presence → factor into Printer chip on the host.
  useEffect(() => {
    if (!watchPrintStation) {
      setPrintStationOnline(null);
      stationOnlineRef.current = null;
      stationLastSeenRef.current = null;
      return;
    }
    stationMountedAt.current = Date.now();
    stationLastSeenRef.current = null;
    stationOnlineRef.current = null;
    setPrintStationOnline(null);

    const unsub = subscribeToPagePresence((payload: PagePresencePayload) => {
      if (payload.page !== "print-station") return;
      stationLastSeenRef.current = payload.at;
      const online = isPageOnline(payload.at);
      stationOnlineRef.current = online;
      setPrintStationOnline(online);
    });

    const staleTimer = window.setInterval(() => {
      const at = stationLastSeenRef.current;
      if (!at) {
        if (Date.now() - stationMountedAt.current >= STATION_GRACE_MS) {
          stationOnlineRef.current = false;
          setPrintStationOnline(false);
        }
        return;
      }
      const online = isPageOnline(at);
      stationOnlineRef.current = online;
      setPrintStationOnline(online);
    }, SHARED_STALE_CHECK_MS);

    const graceTimer = window.setTimeout(() => {
      if (stationOnlineRef.current == null) {
        stationOnlineRef.current = false;
        setPrintStationOnline(false);
      }
    }, STATION_GRACE_MS);

    return () => {
      unsub();
      window.clearInterval(staleTimer);
      window.clearTimeout(graceTimer);
    };
  }, [watchPrintStation]);

  // When station presence flips, refresh host Printer chip (no popup).
  useEffect(() => {
    if (!isBridgeHost) return;
    if (!viaStation) return;
    const next = resolveHostPrinterStatus(
      silentPrint ? localBridgeOk : true,
      printStationOnline,
    );
    setBridgeStatus(next.status);
    setBridgeDetail(next.detail);
    localDetailRef.current = next.detail ?? undefined;
  }, [
    isBridgeHost,
    viaStation,
    printStationOnline,
    localBridgeOk,
    silentPrint,
    resolveHostPrinterStatus,
  ]);

  // Keep network popup only (pre-existing); no print popups.
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

  const value = useMemo(
    () => ({ bridgeStatus, bridgeDetail, isBridgeHost, checkBridge }),
    [bridgeStatus, bridgeDetail, isBridgeHost, checkBridge],
  );

  return (
    <PrintBridgeStatusContext.Provider value={value}>
      {children}
      {!hidden && !onStation && networkAlert ? (
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
                  Mất kết nối mạng
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-600 dark:text-zinc-300">
                  {networkAlert}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 dark:hover:bg-zinc-800"
                aria-label="Đóng"
                onClick={() => setNetworkAlert(null)}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                onClick={() => setNetworkAlert(null)}
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
          title={printerTitle(bridgeStatus, bridgeDetail)}
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
  const title = printerTitle(bridgeStatus, bridgeDetail);

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
          title={title}
          aria-label={title}
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
