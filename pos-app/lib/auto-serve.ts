import type { KitchenStatus, OrderItem, SoundConfigs, Station } from "@/lib/types";
import { normalizeOrderItemStatus } from "@/lib/order-status";

/** Auto-serve delay after kitchen marks an item ready. */
export const AUTO_SERVE_MS = 3 * 60 * 1000;

/** Poll interval for KDS / Bar auto-serve checks. */
export const AUTO_SERVE_POLL_MS = 10_000;

export const DEFAULT_SOUND_CONFIGS: SoundConfigs = {
  callWaiter: "/sounds/bell.mp3",
  newOrder: "/sounds/new_order.mp3",
  paymentSuccess: "/sounds/success.mp3",
};

export const SOUND_FILE_OPTIONS = [
  { value: "/sounds/bell.mp3", label: "bell.mp3" },
  { value: "/sounds/new_order.mp3", label: "new_order.mp3" },
  { value: "/sounds/success.mp3", label: "success.mp3" },
  { value: "/sounds/chime.mp3", label: "chime.mp3" },
  { value: "/sounds/buzzer.mp3", label: "buzzer.mp3" },
  { value: "/sounds/default-bell.mp3", label: "default-bell.mp3" },
] as const;

export function resolveKitchenStatus(
  item: Pick<OrderItem, "kitchenStatus" | "status" | "isCancelled">,
): KitchenStatus {
  if (item.isCancelled || item.kitchenStatus === "cancelled") return "cancelled";
  if (item.kitchenStatus === "archived") return "archived";
  if (
    item.kitchenStatus === "pending" ||
    item.kitchenStatus === "ready" ||
    item.kitchenStatus === "served"
  ) {
    return item.kitchenStatus;
  }
  const status = normalizeOrderItemStatus(item.status);
  if (status === "ready") return "ready";
  if (status === "served") return "served";
  return "pending";
}

export function isCancelledKitchenItem(
  item: Pick<OrderItem, "kitchenStatus" | "status" | "isCancelled">,
): boolean {
  return resolveKitchenStatus(item) === "cancelled" || Boolean(item.isCancelled);
}

export function isKitchenBoardVisible(
  item: Pick<OrderItem, "kitchenStatus" | "status" | "isCancelled">,
): boolean {
  const kitchenStatus = resolveKitchenStatus(item);
  return kitchenStatus === "pending" || kitchenStatus === "ready" || kitchenStatus === "cancelled";
}

export function isReadyForAutoServe(
  item: Pick<OrderItem, "kitchenStatus" | "status" | "readyAt" | "isCancelled">,
  nowMs = Date.now(),
): boolean {
  if (isCancelledKitchenItem(item)) return false;
  if (resolveKitchenStatus(item) !== "ready" || !item.readyAt) return false;
  const readyAtMs = new Date(item.readyAt).getTime();
  if (Number.isNaN(readyAtMs)) return false;
  return nowMs - readyAtMs >= AUTO_SERVE_MS;
}

export function autoServeActor(station?: Station): string {
  if (station === "bar") return "Bar Auto-Serve";
  if (station === "kitchen") return "Kitchen Auto-Serve";
  return "Auto-Serve";
}

export function parseSoundConfigs(value: unknown): SoundConfigs {
  if (!value || typeof value !== "object") return { ...DEFAULT_SOUND_CONFIGS };
  const row = value as Record<string, unknown>;
  return {
    callWaiter:
      typeof row.call_waiter === "string"
        ? row.call_waiter
        : typeof row.callWaiter === "string"
          ? row.callWaiter
          : DEFAULT_SOUND_CONFIGS.callWaiter,
    newOrder:
      typeof row.new_order === "string"
        ? row.new_order
        : typeof row.newOrder === "string"
          ? row.newOrder
          : DEFAULT_SOUND_CONFIGS.newOrder,
    paymentSuccess:
      typeof row.payment_success === "string"
        ? row.payment_success
        : typeof row.paymentSuccess === "string"
          ? row.paymentSuccess
          : DEFAULT_SOUND_CONFIGS.paymentSuccess,
  };
}

export function soundConfigsToDb(configs: SoundConfigs) {
  return {
    call_waiter: configs.callWaiter,
    new_order: configs.newOrder,
    payment_success: configs.paymentSuccess,
  };
}
