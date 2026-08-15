"use client";

import type { TranslationKey } from "@/lib/i18n/translations";
import { layoutPx } from "@/lib/kitchen-print-layout";
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

const PREVIEW_SAMPLE: Record<string, string> = {
  tableLabel: "Table: 12",
  printedAt: "13.08.2026 14:30",
  itemNamePrimary: "2× 宫保鸡",
  itemNameSecondary: "Kung Pao Chicken",
  itemNotePrimary: "少辣",
  itemNoteSecondary: "Less spicy",
  messageMeta: "MESSAGE · 14:31",
  messageBody: "Guest needs extra napkins",
  messageSource: "Hostess · EN",
  footer: "*** STAFF MESSAGE ***",
};

const PREVIEW_BASE_PX: Record<string, number> = {
  tableLabel: 40,
  printedAt: 16,
  itemNamePrimary: 34,
  itemNameSecondary: 20,
  itemNotePrimary: 20,
  itemNoteSecondary: 16,
  messageMeta: 16,
  messageBody: 34,
  messageSource: 16,
  footer: 12,
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
  elementKey,
  onChange,
  translate,
  showOnly = false,
}: {
  label: string;
  element: KitchenPrintLayoutElement;
  elementKey: string;
  onChange: (patch: Partial<KitchenPrintLayoutElement>) => void;
  translate: (key: TranslationKey) => string;
  showOnly?: boolean;
}) {
  const previewBase = PREVIEW_BASE_PX[elementKey] ?? 20;
  const previewPx = layoutPx(previewBase, element);

  return (
    <div className="rounded-lg border border-gray-100 p-3 dark:border-gray-700">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
        {!showOnly && element.show && (
          <span
            className={`rounded bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300 ${
              element.align === "center" ? "mx-auto" : ""
            }`}
            style={{
              fontSize: Math.max(9, Math.min(18, previewPx * 0.35)),
              marginTop: element.marginTop,
              marginBottom: element.marginBottom,
            }}
          >
            {PREVIEW_SAMPLE[elementKey] ?? label}
          </span>
        )}
      </div>
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
          <label className="block text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              {translate("settingsKitchenPrintLayoutSize")}
            </span>
            <select
              value={String(element.sizeScale)}
              onChange={(event) =>
                onChange({
                  sizeScale: Number(event.target.value) as KitchenPrintLayoutSizeScale,
                  fontSizePx: null,
                })
              }
              disabled={element.fontSizePx != null}
              className="pos-input mt-1 disabled:opacity-50"
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
              {translate("settingsKitchenPrintLayoutFontPx")}
            </span>
            <input
              type="number"
              min={8}
              max={120}
              placeholder={translate("settingsKitchenPrintLayoutFontPxAuto")}
              value={element.fontSizePx ?? ""}
              onChange={(event) => {
                const raw = event.target.value.trim();
                onChange({
                  fontSizePx: raw ? Number(raw) || null : null,
                });
              }}
              className="pos-input mt-1"
            />
          </label>
          <label className="block text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              {translate("settingsKitchenPrintLayoutMarginTop")}
            </span>
            <input
              type="number"
              min={0}
              max={48}
              value={element.marginTop}
              onChange={(event) => onChange({ marginTop: Number(event.target.value) || 0 })}
              className="pos-input mt-1"
            />
          </label>
          <label className="block text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              {translate("settingsKitchenPrintLayoutMarginBottom")}
            </span>
            <input
              type="number"
              min={0}
              max={48}
              value={element.marginBottom}
              onChange={(event) => onChange({ marginBottom: Number(event.target.value) || 0 })}
              className="pos-input mt-1"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function TicketPreview({
  title,
  elementKeys,
  labelKeys,
  layoutSection,
  translate,
}: {
  title: string;
  elementKeys: readonly string[];
  labelKeys: Record<string, TranslationKey>;
  layoutSection: Record<string, KitchenPrintLayoutElement>;
  translate: (key: TranslationKey) => string;
}) {
  const blocks = [...elementKeys]
    .filter((key) => layoutSection[key]?.show)
    .map((key) => ({
      key,
      order: layoutSection[key]?.order ?? 0,
      element: layoutSection[key]!,
    }))
    .sort((a, b) => a.order - b.order);

  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-3 dark:border-gray-600 dark:bg-gray-950">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </p>
      <div className="mx-auto max-w-[280px] space-y-0.5 font-mono leading-tight">
        {blocks.map(({ key, element }) => {
          const base = PREVIEW_BASE_PX[key] ?? 16;
          const px = layoutPx(base, element);
          return (
            <div
              key={key}
              style={{
                fontSize: Math.max(8, Math.min(22, px * 0.38)),
                marginTop: element.marginTop,
                marginBottom: element.marginBottom,
                textAlign: element.align,
              }}
              className="truncate text-gray-900 dark:text-gray-100"
              title={translate(labelKeys[key])}
            >
              {PREVIEW_SAMPLE[key] ?? key}
            </div>
          );
        })}
      </div>
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
    <section className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 dark:border-gray-700 dark:bg-gray-900/40">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {translate("settingsKitchenPrintLayoutTitle")}
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {translate("settingsKitchenPrintLayoutHint")}
        </p>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <TicketPreview
          title={translate("settingsKitchenPrintLayoutPreviewOrder")}
          elementKeys={ORDER_ELEMENT_KEYS}
          labelKeys={ORDER_ELEMENT_LABEL_KEYS}
          layoutSection={layout.orderTicket as unknown as Record<string, KitchenPrintLayoutElement>}
          translate={translate}
        />
        <TicketPreview
          title={translate("settingsKitchenPrintLayoutPreviewMessage")}
          elementKeys={MESSAGE_ELEMENT_KEYS}
          labelKeys={MESSAGE_ELEMENT_LABEL_KEYS}
          layoutSection={layout.messageTicket as unknown as Record<string, KitchenPrintLayoutElement>}
          translate={translate}
        />
      </div>

      <div className="space-y-4 border-t border-gray-200 px-4 py-4 dark:border-gray-700">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
            {translate("settingsKitchenPrintLayoutOrderTicket")}
          </h4>
          <div className="space-y-2">
            {ORDER_ELEMENT_KEYS.map((key) => (
              <LayoutElementRow
                key={key}
                elementKey={key}
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
                elementKey={key}
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
    </section>
  );
}
