"use client";

import { useEffect, useState } from "react";
import type { KitchenPrintLayout } from "@/lib/kitchen-print-layout";
import type { TranslationKey } from "@/lib/i18n/translations";
import type {
  KitchenPrintFontSize,
  KitchenPrintLanguage,
  MenuItem,
  OrderItem,
  ReceiptFontWeight,
} from "@/lib/types";
import { buildKitchenTicketHtml } from "@/src/lib/printKitchenTicket";

const PREVIEW_MENU: MenuItem[] = [
  {
    id: "preview-seoul-set",
    nameEn: "Seoul Signature Set",
    nameCz: "Seoul Signature Set",
    nameZh: "首尔招牌套餐",
    category: "Grill Sets",
    price: 0,
    isAvailable: true,
    station: "kitchen",
    itemType: "food",
    sortOrder: 0,
  },
  {
    id: "preview-veg",
    nameEn: "Vegetable Platter",
    nameCz: "Zeleninový talíř (4 druhy)",
    nameZh: "蔬菜拼盘(4种)",
    category: "Sides",
    price: 0,
    isAvailable: true,
    station: "kitchen",
    itemType: "food",
    sortOrder: 1,
  },
  {
    id: "preview-eel",
    nameEn: "Grilled Eel",
    nameCz: "Grilovaný úhoř (filet)",
    nameZh: "烤鳗鱼",
    category: "BBQ Grill",
    price: 0,
    isAvailable: true,
    station: "kitchen",
    itemType: "food",
    sortOrder: 2,
  },
  {
    id: "preview-prawn",
    nameEn: "Tiger Prawns",
    nameCz: "Tygří krevety (4 ks)",
    nameZh: "老虎虾",
    category: "BBQ Grill",
    price: 0,
    isAvailable: true,
    station: "kitchen",
    itemType: "food",
    sortOrder: 3,
  },
  {
    id: "preview-udon",
    nameEn: "Udon - Chicken",
    nameCz: "Udon - Kuřecí",
    nameZh: "乌冬面-鸡肉",
    category: "Noodles",
    price: 0,
    isAvailable: true,
    station: "kitchen",
    itemType: "food",
    sortOrder: 4,
  },
];

const PREVIEW_ORDERS: OrderItem[] = [
  {
    name: "Prepare dipping sauce for 2 guests",
    notesTranslated: "准备烤肉蘸料 · 2位",
    notes: "Prepare dipping sauce for 2 guests",
    quantity: 1,
    price: 0,
  },
  {
    name: "Seoul Signature Set",
    menuItemId: "preview-seoul-set",
    quantity: 1,
    price: 0,
  },
  {
    name: "Vegetable Platter",
    menuItemId: "preview-veg",
    quantity: 1,
    price: 0,
  },
  {
    name: "Grilled Eel",
    menuItemId: "preview-eel",
    quantity: 1,
    price: 0,
  },
  {
    name: "Tiger Prawns",
    menuItemId: "preview-prawn",
    quantity: 1,
    price: 0,
  },
  {
    name: "Udon - Chicken",
    menuItemId: "preview-udon",
    quantity: 1,
    price: 0,
  },
];

export function KitchenTicketSpacingPreview({
  itemGapPx,
  clipTopMm,
  fontSize,
  fontWeight,
  layout,
  primaryLang,
  secondaryLang,
  translate,
}: {
  itemGapPx: number;
  clipTopMm: number;
  fontSize: KitchenPrintFontSize;
  fontWeight: ReceiptFontWeight;
  layout: KitchenPrintLayout;
  primaryLang: KitchenPrintLanguage;
  secondaryLang: KitchenPrintLanguage | "none";
  translate: (key: TranslationKey) => string;
}) {
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const ticket = await buildKitchenTicketHtml({
          tableLabel: "S1 打包",
          orders: PREVIEW_ORDERS,
          menuItems: PREVIEW_MENU,
          primaryLang,
          secondaryLang,
          fontSize,
          fontWeight,
          layout,
          clipTopMm,
          itemGapPx,
        });
        if (!cancelled) setHtml(ticket.html);
      } catch {
        if (!cancelled) setHtml("");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    itemGapPx,
    clipTopMm,
    fontSize,
    fontWeight,
    layout,
    primaryLang,
    secondaryLang,
  ]);

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {translate("settingsKitchenPrintItemGapPreview")}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {translate("settingsKitchenPrintItemGapPreviewHint")}
        </p>
      </div>
      <div className="max-h-[520px] overflow-y-auto p-4">
        {busy && !html ? (
          <p className="py-12 text-center text-sm text-gray-400">{translate("loading")}</p>
        ) : (
          <div
            className="mx-auto max-w-[560px] bg-white px-2 py-3 shadow-md ring-1 ring-gray-200 dark:ring-gray-700"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}
