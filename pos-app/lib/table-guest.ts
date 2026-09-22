import { isTakeawayTable } from "@/lib/tax-summary";
import type { RestaurantTable } from "@/lib/types";

export type TableGuestRequestKind = "call_staff" | "banchan" | "grill_change" | "payment";
export type TableGuestRequestStatus = "pending" | "completed" | "cancelled";
export type TableGuestPaymentMethod = "card" | "cash";

export type BanchanSelection = {
  id: string;
  label: string;
  quantity: number;
};

export type TableGuestRequestPayload = {
  banchan?: BanchanSelection[];
  paymentMethod?: TableGuestPaymentMethod;
  note?: string;
};

export type TableGuestRequestRecord = {
  id: string;
  tableId: string;
  tableLabel: string;
  kind: TableGuestRequestKind;
  status: TableGuestRequestStatus;
  payload: TableGuestRequestPayload;
  note?: string;
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
};

export function getPublicAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

/** Permanent guest URL mapped to table UUID — never rotates on scan. */
export function buildTableGuestUrl(tableId: string, baseUrl?: string): string {
  const base = (baseUrl ?? getPublicAppBaseUrl()).replace(/\/$/, "");
  return `${base}/table/${encodeURIComponent(tableId)}`;
}

/** Floor dine-in tables only — exclude takeaway S1/S2/S3/S5. */
export function isTableQrEligible(table: Pick<RestaurantTable, "label">): boolean {
  if (isTakeawayTable(table.label)) return false;
  const code = table.label.trim().toLowerCase();
  if (code === "s" || /^s[\s_-]/.test(code)) return false;
  return true;
}

export type BanchanOption = {
  id: string;
  labelEn: string;
  labelCs: string;
};

/**
 * Fallback Banchan list — must match POS Storage option group "Banchan"
 * (All, Kimchi, Radish, Cucumber, Seaweed, Salad, Peanuts, Wakame, Edamame).
 * Prefer live options from option_group_library when available.
 */
export const BANCHAN_OPTIONS: BanchanOption[] = [
  { id: "all", labelEn: "All", labelCs: "All" },
  { id: "kimchi", labelEn: "Kimchi", labelCs: "Kimchi" },
  { id: "radish", labelEn: "Radish", labelCs: "Redkev" },
  { id: "cucumber", labelEn: "Cucumber", labelCs: "Okurka" },
  { id: "seaweed", labelEn: "Seaweed", labelCs: "Rasy" },
  { id: "salad", labelEn: "Salad", labelCs: "Salad" },
  { id: "peanuts", labelEn: "Peanuts", labelCs: "Arasidy" },
  { id: "wakame", labelEn: "Wakame", labelCs: "Wakame" },
  { id: "edamame", labelEn: "Edamame", labelCs: "Edamame" },
];

export function requestKindLabel(kind: TableGuestRequestKind): string {
  switch (kind) {
    case "call_staff":
      return "Call staff";
    case "banchan":
      return "Banchan";
    case "grill_change":
      return "Grill change";
    case "payment":
      return "Payment";
  }
}
