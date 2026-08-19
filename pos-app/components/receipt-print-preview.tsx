"use client";

import { useMemo } from "react";
import { Eye, Printer } from "lucide-react";
import { buildTestReceiptData } from "@/lib/receipt-calculations";
import type { TranslationKey } from "@/lib/i18n/translations";
import {
  receiptTypographyCssVars,
  receiptTypographyFromSettings,
} from "@/lib/receipt-print-styles";
import type { ReceiptFontFamily, ReceiptFontSize, ReceiptFontWeight } from "@/lib/types";
import {
  draftToReceiptTemplate,
  ReceiptBodyContent,
  type ReceiptTemplateDraft,
} from "@/src/components/ReceiptPrint";

interface ReceiptPrintPreviewProps {
  draft: ReceiptTemplateDraft & {
    receiptFontFamily: ReceiptFontFamily;
    receiptFontSize: ReceiptFontSize;
    receiptFontWeight: ReceiptFontWeight;
  };
  translate: (key: TranslationKey) => string;
  onOpenFullPreview?: () => void;
  onTestPrint?: () => void;
}

export function ReceiptPrintPreview({
  draft,
  translate,
  onOpenFullPreview,
  onTestPrint,
}: ReceiptPrintPreviewProps) {
  const template = useMemo(() => draftToReceiptTemplate(draft), [draft]);

  const typography = useMemo(
    () =>
      receiptTypographyFromSettings({
        receiptFontFamily: draft.receiptFontFamily,
        receiptFontSize: draft.receiptFontSize,
        receiptFontWeight: draft.receiptFontWeight,
      }),
    [draft.receiptFontFamily, draft.receiptFontSize, draft.receiptFontWeight],
  );

  const previewData = useMemo(() => {
    const business = {
      brandName: template.brandName,
      brandAddress: template.brandAddress,
      legalName: template.legalName,
      companyAddress: template.companyAddress,
      ico: template.ico,
      dic: template.dic,
      phone: template.phone,
      footerLines: template.footerLines,
    };
    return buildTestReceiptData(business);
  }, [template]);

  const thermalStyle = receiptTypographyCssVars(typography);

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-950/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {translate("settingsReceiptPrintPreview")}
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {translate("settingsReceiptPrintPreviewHint")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenFullPreview && (
            <button
              type="button"
              onClick={onOpenFullPreview}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <Eye className="h-4 w-4" />
              {translate("settingsReceiptPrintPreviewOpen")}
            </button>
          )}
          {onTestPrint && (
            <button
              type="button"
              onClick={onTestPrint}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <Printer className="h-4 w-4" />
              {translate("settingsTestPrint")}
            </button>
          )}
        </div>
      </div>

      <div className="receipt-preview-stage mt-4">
        <div className="receipt-preview-frame">
          <div
            className="receipt-inner receipt-czech receipt-sheet receipt-thermal"
            style={thermalStyle as React.CSSProperties}
          >
            <ReceiptBodyContent data={previewData} template={template} />
          </div>
        </div>
      </div>
    </div>
  );
}
