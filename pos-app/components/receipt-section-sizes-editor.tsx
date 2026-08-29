"use client";

import type { TranslationKey } from "@/lib/i18n/translations";
import {
  RECEIPT_SECTION_KEYS,
  RECEIPT_SECTION_SIZE_SCALES,
  type ReceiptSectionKey,
  type ReceiptSectionSizeScale,
  type ReceiptSectionSizes,
} from "@/lib/receipt-section-sizes";

const SECTION_LABEL_KEYS: Record<ReceiptSectionKey, TranslationKey> = {
  header: "settingsReceiptSectionHeader",
  meta: "settingsReceiptSectionMeta",
  items: "settingsReceiptSectionItems",
  totals: "settingsReceiptSectionTotals",
  celkem: "settingsReceiptSectionCelkem",
  vat: "settingsReceiptSectionVat",
  footer: "settingsReceiptSectionFooter",
};

const SIZE_LABEL_KEYS: Record<ReceiptSectionSizeScale, TranslationKey> = {
  0.75: "settingsReceiptSectionSize75",
  1: "settingsReceiptSectionSize100",
  1.25: "settingsReceiptSectionSize125",
  1.5: "settingsReceiptSectionSize150",
};

interface ReceiptSectionSizesEditorProps {
  value: ReceiptSectionSizes;
  onChange: (next: ReceiptSectionSizes) => void;
  translate: (key: TranslationKey) => string;
}

export function ReceiptSectionSizesEditor({
  value,
  onChange,
  translate,
}: ReceiptSectionSizesEditorProps) {
  return (
    <div className="mt-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {translate("settingsReceiptSectionSizes")}
        </h4>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {translate("settingsReceiptSectionSizesHint")}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {RECEIPT_SECTION_KEYS.map((key) => (
          <label key={key} className="block text-sm">
            <span className="text-gray-500 dark:text-gray-400">{translate(SECTION_LABEL_KEYS[key])}</span>
            <select
              value={String(value[key])}
              onChange={(event) => {
                const scale = Number(event.target.value) as ReceiptSectionSizeScale;
                onChange({ ...value, [key]: scale });
              }}
              className="pos-input mt-1"
            >
              {RECEIPT_SECTION_SIZE_SCALES.map((scale) => (
                <option key={scale} value={String(scale)}>
                  {translate(SIZE_LABEL_KEYS[scale])}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
