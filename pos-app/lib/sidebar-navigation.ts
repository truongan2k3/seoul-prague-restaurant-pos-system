import type { TranslationKey } from "@/lib/i18n/translations";
import type { NavId } from "@/lib/types";

export const SIDEBAR_TABS = [
  { id: "map", labelKey: "map" },
  { id: "reservations", labelKey: "reservations" },
  { id: "guestChat", labelKey: "guestChatTitle" },
  { id: "referrals", labelKey: "referralsTitle" },
  { id: "vouchers", labelKey: "vouchersTitle" },
  { id: "history", labelKey: "history" },
  { id: "summary", labelKey: "summary" },
  { id: "storage", labelKey: "storage" },
  { id: "dynamicQr", labelKey: "dynamicQrServices" },
  { id: "settings", labelKey: "settings" },
  { id: "about", labelKey: "about" },
] as const satisfies readonly { id: NavId; labelKey: TranslationKey }[];

export const DEFAULT_SIDEBAR_NAV_ORDER: NavId[] = SIDEBAR_TABS.map(tab => tab.id);

export function normalizeSidebarNavOrder(value: unknown): NavId[] {
  const result: NavId[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "string") continue;
      const id = entry.trim() === "order" ? "map" : entry.trim();
      const tab = SIDEBAR_TABS.find(tab => tab.id === id);
      if (tab && !result.includes(tab.id)) result.push(tab.id);
    }
  }
  for (const id of DEFAULT_SIDEBAR_NAV_ORDER) if (!result.includes(id)) result.push(id);
  return result;
}
