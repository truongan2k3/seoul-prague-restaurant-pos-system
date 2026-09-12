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

export const BANCHAN_OPTIONS: { id: string; labelEn: string; labelCs: string }[] = [
  { id: "kimchi", labelEn: "Kimchi", labelCs: "Kimchi" },
  { id: "radish", labelEn: "Pickled radish", labelCs: "Nakládaná ředkev" },
  { id: "bean_sprouts", labelEn: "Bean sprouts", labelCs: "Mungo klíčky" },
  { id: "spinach", labelEn: "Seasoned spinach", labelCs: "Špenát" },
  { id: "potato", labelEn: "Potato salad", labelCs: "Bramborový salát" },
  { id: "lettuce", labelEn: "Lettuce wraps", labelCs: "Salátové listy" },
  { id: "garlic", labelEn: "Garlic", labelCs: "Česnek" },
  { id: "ssamjang", labelEn: "Ssamjang", labelCs: "Ssamjang" },
  { id: "rice", labelEn: "Rice", labelCs: "Rýže" },
  { id: "egg_soup", labelEn: "Egg soup", labelCs: "Vaječná polévka" },
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
