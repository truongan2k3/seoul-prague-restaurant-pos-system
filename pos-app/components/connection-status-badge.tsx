"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Wifi, WifiOff, X } from "lucide-react";
import {
  CONNECTION_STATUS_LABELS,
  type ConnectionStatus,
} from "@/lib/connection-status";
import { useConnectionStatus } from "@/contexts/connection-status-context";
import { LiveClock } from "@/components/live-clock";
import { isStationPath } from "@/lib/page-routes";

const NETWORK_ALERT_COOLDOWN_MS = 60_000;

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

function networkIconShell(status: ConnectionStatus): string {
  if (status === "online") {
    return "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300";
  }
  if (status === "no-network") {
    return "bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300";
  }
  return "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300";
}

/** Network-only status shell — printer heartbeats removed (fail → pending reprint instead). */
export function ConnectionStatusBadge({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const { status } = useConnectionStatus();
  const [networkAlert, setNetworkAlert] = useState<string | null>(null);
  const lastNetworkAlertAt = useRef(0);
  const prevNetworkStatus = useRef<ConnectionStatus | null>(null);

  const hidden = shouldHideOnPath(pathname);
  const onStation = Boolean(pathname && isStationPath(pathname));

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

  return (
    <>
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
    </>
  );
}

/** Online chip only — desktop top bars. */
export function PosStatusChips({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const { status } = useConnectionStatus();

  if (shouldHideOnPath(pathname)) return null;
  if (pathname && isStationPath(pathname)) return null;

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
    </div>
  );
}

/** Online icon only — mobile sidebar. */
export function SidebarStatusIcons({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const { status } = useConnectionStatus();

  if (shouldHideOnPath(pathname)) return null;
  if (pathname && isStationPath(pathname)) return null;

  const NetworkIcon = status === "online" ? Wifi : WifiOff;

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
    </div>
  );
}

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
