"use client";

import { usePathname } from "next/navigation";
import {
  CONNECTION_STATUS_COLORS,
  CONNECTION_STATUS_LABELS,
  type ConnectionStatus,
} from "@/lib/connection-status";
import { useConnectionStatus } from "@/contexts/connection-status-context";

const STATUS_RING: Record<ConnectionStatus, string> = {
  online: "ring-emerald-500/30",
  offline: "ring-amber-500/30",
  "no-network": "ring-red-500/40",
};

/** Small corner indicator for network + Realtime connection state. */
export function ConnectionStatusBadge() {
  const pathname = usePathname();
  const { status } = useConnectionStatus();

  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/status" ||
    pathname === "/reservation" ||
    pathname.startsWith("/reservation/") ||
    pathname === "/landing" ||
    pathname.startsWith("/landing/") ||
    pathname === "/" ||
    pathname === "/menu" ||
    pathname.startsWith("/menu/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  ) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed bottom-3 left-3 z-[9990] flex items-center gap-1.5 rounded-full border border-black/10 bg-white/90 px-2 py-1 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/90"
      title={CONNECTION_STATUS_LABELS[status]}
      aria-label={CONNECTION_STATUS_LABELS[status]}
    >
      <span
        className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ring-2 ${CONNECTION_STATUS_COLORS[status]} ${STATUS_RING[status]}`}
        aria-hidden
      />
      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-600 dark:text-zinc-300">
        {CONNECTION_STATUS_LABELS[status]}
      </span>
    </div>
  );
}
