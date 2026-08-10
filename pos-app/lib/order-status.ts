import type { OrderItemStatus } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/translations";

/** Strict 4-step workflow (held is a pause state before preparing). */
export const WORKFLOW_STATUSES = ["pending", "preparing", "ready", "served"] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

const LEGACY_STATUS_MAP: Record<string, OrderItemStatus> = {
  fired: "pending",
  delayed: "preparing",
  done: "ready",
  pending: "pending",
  held: "held",
  preparing: "preparing",
  ready: "ready",
  served: "served",
};

export function normalizeOrderItemStatus(status: string | undefined): OrderItemStatus {
  if (!status) return "pending";
  return LEGACY_STATUS_MAP[status] ?? "pending";
}

export function nextWorkflowStatus(status: OrderItemStatus | undefined): OrderItemStatus | null {
  const current = normalizeOrderItemStatus(status);
  if (current === "held") return "preparing";
  const index = WORKFLOW_STATUSES.indexOf(current as WorkflowStatus);
  if (index === -1 || index >= WORKFLOW_STATUSES.length - 1) return null;
  return WORKFLOW_STATUSES[index + 1];
}

/** Statuses visible on KDS / Bar boards (pending/preparing + ready; served auto-hides). */
export const STATION_BOARD_STATUSES: OrderItemStatus[] = ["pending", "preparing", "ready"];
export const STATION_BOARD_KITCHEN_STATUSES = ["pending", "ready", "cancelled"] as const;

export function isStationBoardStatus(status: OrderItemStatus | undefined): boolean {
  return STATION_BOARD_STATUSES.includes(normalizeOrderItemStatus(status));
}

export function statusTranslationKey(status: OrderItemStatus): TranslationKey {
  const normalized = normalizeOrderItemStatus(status);
  if (normalized === "preparing") return "preparing";
  if (normalized === "ready") return "ready";
  if (normalized === "served") return "served";
  if (normalized === "held") return "hold";
  return "pending";
}

export function rowSurfaceClass(status: OrderItemStatus | undefined): string {
  const normalized = normalizeOrderItemStatus(status);
  switch (normalized) {
    case "ready":
      return "bg-emerald-100 border-emerald-400 text-emerald-950";
    case "preparing":
      return "bg-amber-100 border-amber-400 text-amber-950";
    case "served":
      return "bg-slate-100 border-slate-300 text-slate-600";
    case "held":
      return "bg-violet-100 border-violet-400 text-violet-950";
    default:
      return "bg-white border-gray-300 text-gray-950";
  }
}

export function statusButtonClass(status: OrderItemStatus | undefined): string {
  const normalized = normalizeOrderItemStatus(status);
  switch (normalized) {
    case "ready":
      return "bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700";
    case "preparing":
      return "bg-amber-500 text-amber-950 hover:bg-amber-400 active:bg-amber-600";
    case "served":
      return "bg-slate-500 text-white cursor-default";
    default:
      return "bg-gray-900 text-white hover:bg-gray-800 active:bg-black";
  }
}
