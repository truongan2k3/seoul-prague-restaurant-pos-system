"use client";

import type { TranslationKey } from "@/lib/i18n/translations";
import type {
  KitchenPrintLayout,
  KitchenPrintLayoutElement,
  KitchenPrintLayoutSizeScale,
  KitchenPrintMessageTicketLayout,
  KitchenPrintOrderTicketLayout,
} from "@/lib/kitchen-print-layout";

type LayoutSection = "orderTicket" | "messageTicket";

type OrderElementKey = keyof KitchenPrintOrderTicketLayout;
type MessageElementKey = keyof KitchenPrintMessageTicketLayout;

const ORDER_ELEMENT_KEYS: OrderElementKey[] = [
  "tableLabel",
  "printedAt",
  "itemNamePrimary",
  "itemNameSecondary",
  "itemNotePrimary",
  "itemNoteSecondary",
];

const MESSAGE_ELEMENT_KEYS: MessageElementKey[] = [
  "tableLabel",
  "messageMeta",
  "messageBody",
  "messageSource",
  "footer",
];

const ORDER_ELEMENT_LABEL_KEYS: Record<OrderElementKey, TranslationKey> = {
  tableLabel: "settingsKitchenPrintLayoutElTable",
  printedAt: "settingsKitchenPrintLayoutElPrintedAt",
  itemNamePrimary: "settingsKitchenPrintLayoutElItemNamePrimary",
  itemNameSecondary: "settingsKitchenPrintLayoutElItemNameSecondary",
  itemNotePrimary: "settingsKitchenPrintLayoutElItemNotePrimary",
  itemNoteSecondary: "settingsKitchenPrintLayoutElItemNoteSecondary",
};

const MESSAGE_ELEMENT_LABEL_KEYS: Record<MessageElementKey, TranslationKey> = {
  tableLabel: "settingsKitchenPrintLayoutElTable",
  messageMeta: "settingsKitchenPrintLayoutElMessageMeta",
  messageBody: "settingsKitchenPrintLayoutElMessageBody",
  messageSource: "settingsKitchenPrintLayoutElMessageSource",
  footer: "settingsKitchenPrintLayoutElMessageFooter",
};

const SIZE_OPTIONS: { value: KitchenPrintLayoutSizeScale; labelKey: TranslationKey }[] = [
  { value: 0.75, labelKey: "settingsKitchenPrintLayoutSize75" },
  { value: 1, labelKey: "settingsKitchenPrintLayoutSize100" },
  { value: 1.25, labelKey: "settingsKitchenPrintLayoutSize125" },
  { value: 1.5, labelKey: "settingsKitchenPrintLayoutSize150" },
];

function LayoutElementRow({
  label,
  element,
  onChange,
  translate,
  showOnly = false,
}: {
  label: string;
  element: KitchenPrintLayoutElement;
  onChange: (patch: Partial<KitchenPrintLayoutElement>) => void;
  translate: (key: TranslationKey) => string;
  showOnly?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-100 p-3 dark:border-gray-700">
      <div className="mb-2 text-sm font-medium text-gray-800 dark:text-gray-200">{label}</div>
      {showOnly ? (
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={element.show}
            onChange={(event) => onChange({ show: event.target.checked })}
            className="h-4 w-4 rounded border-gray-300"
          />
          {translate("settingsKitchenPrintLayoutShow")}
        </label>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={element.show}
              onChange={(event) => onChange({ show: event.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            {translate("settingsKitchenPrintLayoutShow")}
          </label>
          <label className="block text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              {translate("settingsKitchenPrintLayoutAlign")}
            </span>
            <select
              value={element.align}
              onChange={(event) =>
                onChange({
                  align: event.target.value as KitchenPrintLayoutElement["align"],
                })
              }
              className="pos-input mt-1"
            >
              <option value="left">{translate("settingsKitchenPrintLayoutAlignLeft")}</option>
              <option value="center">{translate("settingsKitchenPrintLayoutAlignCenter")}</option>
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              {translate("settingsKitchenPrintLayoutSize")}
            </span>
            <select
              value={String(element.sizeScale)}
              onChange={(event) =>
                onChange({
                  sizeScale: Number(event.target.value) as KitchenPrintLayoutSizeScale,
                })
              }
              className="pos-input mt-1"
            >
              {SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {translate(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              {translate("settingsKitchenPrintLayoutOrder")}
            </span>
            <input
              type="number"
              min={0}
              max={20}
              value={element.order}
              onChange={(event) => onChange({ order: Number(event.target.value) || 0 })}
              className="pos-input mt-1"
            />
          </label>
        </div>
      )}
    </div>
  );
}

export function KitchenPrintLayoutEditor({
  layout,
  onChange,
  translate,
}: {
  layout: KitchenPrintLayout;
  onChange: (layout: KitchenPrintLayout) => void;
  translate: (key: TranslationKey) => string;
}) {
  const updateSection = <K extends LayoutSection>(
    section: K,
    key: K extends "orderTicket" ? OrderElementKey : MessageElementKey,
    patch: Partial<KitchenPrintLayoutElement>,
  ) => {
    if (section === "orderTicket") {
      const orderKey = key as OrderElementKey;
      onChange({
        ...layout,
        orderTicket: {
          ...layout.orderTicket,
          [orderKey]: { ...layout.orderTicket[orderKey], ...patch },
        },
      });
      return;
    }

    const messageKey = key as MessageElementKey;
    onChange({
      ...layout,
      messageTicket: {
        ...layout.messageTicket,
        [messageKey]: { ...layout.messageTicket[messageKey], ...patch },
      },
    });
  };

  return (
    <details className="mt-3 rounded-lg border border-gray-200 bg-gray-50/60 dark:border-gray-700 dark:bg-gray-900/40">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
        {translate("settingsKitchenPrintLayoutTitle")}
      </summary>
      <div className="space-y-4 border-t border-gray-200 px-4 py-4 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {translate("settingsKitchenPrintLayoutHint")}
        </p>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
            {translate("settingsKitchenPrintLayoutOrderTicket")}
          </h4>
          <div className="space-y-2">
            {ORDER_ELEMENT_KEYS.map((key) => (
              <LayoutElementRow
                key={key}
                label={translate(ORDER_ELEMENT_LABEL_KEYS[key])}
                element={layout.orderTicket[key]}
                onChange={(patch) => updateSection("orderTicket", key, patch)}
                translate={translate}
              />
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
            {translate("settingsKitchenPrintLayoutMessageTicket")}
          </h4>
          <div className="space-y-2">
            {MESSAGE_ELEMENT_KEYS.map((key) => (
              <LayoutElementRow
                key={key}
                label={translate(MESSAGE_ELEMENT_LABEL_KEYS[key])}
                element={layout.messageTicket[key]}
                onChange={(patch) => updateSection("messageTicket", key, patch)}
                translate={translate}
                showOnly={key === "footer"}
              />
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
