"use client";

import type { ReceiptBrandingVisibility } from "@/lib/receipt-branding";
import type { TranslationKey } from "@/lib/i18n/translations";

type BrandingFieldKey = keyof ReceiptBrandingVisibility;

const FIELD_LABEL_KEYS: Record<BrandingFieldKey, TranslationKey> = {
  showHeaderTitle: "settingsReceiptHeader",
  showBrandAddress: "settingsReceiptAddress",
  showLegalName: "settingsReceiptLegalName",
  showCompanyAddress: "settingsReceiptCompanyAddress",
  showIcoDic: "settingsReceiptIcoDicToggle",
  showPhone: "settingsReceiptPhone",
  showFooter: "settingsReceiptFooter",
};

export type ReceiptBrandingDraft = ReceiptBrandingVisibility & {
  receiptHeaderTitle: string;
  receiptLegalName: string;
  receiptAddress: string;
  receiptCompanyAddress: string;
  receiptIco: string;
  receiptDic: string;
  receiptPhone: string;
  receiptFooterNote: string;
};

export function ReceiptBrandingEditor({
  draft,
  onChange,
  translate,
}: {
  draft: ReceiptBrandingDraft;
  onChange: (patch: Partial<ReceiptBrandingDraft>) => void;
  translate: (key: TranslationKey) => string;
}) {
  const toggle = (key: BrandingFieldKey, checked: boolean) => {
    onChange({ [key]: checked } as Partial<ReceiptBrandingDraft>);
  };

  const renderField = (visibilityKey: BrandingFieldKey, input: React.ReactNode) => (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/40">
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={draft[visibilityKey]}
          onChange={(event) => toggle(visibilityKey, event.target.checked)}
          className="h-4 w-4 shrink-0 rounded border-gray-300"
        />
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
          {translate(FIELD_LABEL_KEYS[visibilityKey])}
        </span>
      </label>
      <div className={`mt-2 ${draft[visibilityKey] ? "" : "opacity-50"}`}>{input}</div>
    </div>
  );

  return (
    <div className="mt-3 space-y-3">
      {renderField(
        "showHeaderTitle",
        <input
          value={draft.receiptHeaderTitle}
          onChange={(event) => onChange({ receiptHeaderTitle: event.target.value })}
          className="pos-input w-full"
          disabled={!draft.showHeaderTitle}
        />,
      )}
      {renderField(
        "showBrandAddress",
        <input
          value={draft.receiptAddress}
          onChange={(event) => onChange({ receiptAddress: event.target.value })}
          className="pos-input w-full"
          disabled={!draft.showBrandAddress}
        />,
      )}
      {renderField(
        "showLegalName",
        <input
          value={draft.receiptLegalName}
          onChange={(event) => onChange({ receiptLegalName: event.target.value })}
          className="pos-input w-full"
          disabled={!draft.showLegalName}
        />,
      )}
      {renderField(
        "showCompanyAddress",
        <input
          value={draft.receiptCompanyAddress}
          onChange={(event) => onChange({ receiptCompanyAddress: event.target.value })}
          className="pos-input w-full"
          disabled={!draft.showCompanyAddress}
        />,
      )}
      {renderField(
        "showIcoDic",
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-gray-500 dark:text-gray-400">{translate("settingsReceiptIco")}</span>
            <input
              value={draft.receiptIco}
              onChange={(event) => onChange({ receiptIco: event.target.value })}
              className="pos-input mt-1 w-full"
              disabled={!draft.showIcoDic}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-500 dark:text-gray-400">{translate("settingsReceiptDic")}</span>
            <input
              value={draft.receiptDic}
              onChange={(event) => onChange({ receiptDic: event.target.value })}
              className="pos-input mt-1 w-full"
              disabled={!draft.showIcoDic}
            />
          </label>
        </div>,
      )}
      {renderField(
        "showPhone",
        <input
          value={draft.receiptPhone}
          onChange={(event) => onChange({ receiptPhone: event.target.value })}
          className="pos-input w-full"
          disabled={!draft.showPhone}
        />,
      )}
      {renderField(
        "showFooter",
        <textarea
          value={draft.receiptFooterNote}
          onChange={(event) => onChange({ receiptFooterNote: event.target.value })}
          className="pos-input min-h-[72px] w-full"
          placeholder={"Děkujeme za Vaši návštěvu!\nOtevírací doba: Po-Ne 10:00-22:00"}
          disabled={!draft.showFooter}
        />,
      )}
    </div>
  );
}
