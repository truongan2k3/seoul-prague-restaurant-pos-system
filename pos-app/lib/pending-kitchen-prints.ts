import type { OrderItem } from "@/lib/types";

export type PendingKitchenPrintKind = "ticket" | "message";

export type PendingKitchenPrintJob = {
  id: string;
  kind: PendingKitchenPrintKind;
  tableId?: string;
  tableLabel: string;
  orders?: OrderItem[];
  message?: string;
  messageZh?: string;
  error: string;
  failedAt: string;
};

const STORAGE_KEY = "pos_pending_kitchen_prints_v1";
const MAX_PENDING = 40;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadPendingKitchenPrints(): PendingKitchenPrintJob[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is PendingKitchenPrintJob =>
        Boolean(row && typeof row === "object" && typeof (row as PendingKitchenPrintJob).id === "string"),
    );
  } catch {
    return [];
  }
}

export function savePendingKitchenPrints(jobs: PendingKitchenPrintJob[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, MAX_PENDING)));
  } catch {
    /* ignore quota */
  }
}

export function upsertPendingKitchenPrint(
  job: PendingKitchenPrintJob,
  existing: PendingKitchenPrintJob[],
): PendingKitchenPrintJob[] {
  const next = [job, ...existing.filter((row) => row.id !== job.id)].slice(0, MAX_PENDING);
  savePendingKitchenPrints(next);
  return next;
}

export function removePendingKitchenPrint(
  id: string,
  existing: PendingKitchenPrintJob[],
): PendingKitchenPrintJob[] {
  const next = existing.filter((row) => row.id !== id);
  savePendingKitchenPrints(next);
  return next;
}
