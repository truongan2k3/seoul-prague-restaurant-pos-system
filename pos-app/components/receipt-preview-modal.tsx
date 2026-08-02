"use client";

import { Printer } from "lucide-react";
import { Modal } from "@/components/modal";
import { ReceiptBodyContent, type ReceiptTemplate } from "@/src/components/ReceiptPrint";
import type { ReceiptData } from "@/lib/receipt-calculations";

interface ReceiptPreviewModalProps {
  open: boolean;
  data: ReceiptData | null;
  template?: ReceiptTemplate;
  onClose: () => void;
  onPrint: () => void;
}

export function ReceiptPreviewModal({
  open,
  data,
  template,
  onClose,
  onPrint,
}: ReceiptPreviewModalProps) {
  if (!data) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="80mm Thermal Receipt Preview"
      size="md"
      bodyClassName="!max-h-[70vh] !overflow-y-auto !px-4 !py-4"
      footer={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold dark:border-gray-600"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
          >
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </button>
        </div>
      }
    >
      <p className="mb-3 text-center text-xs text-gray-500 dark:text-gray-400">
        Preview at true 80mm width. Use Print / Save PDF — set margins to None and disable headers/footers.
      </p>
      <div className="receipt-preview-stage mx-auto max-w-full">
        <div className="receipt-preview-frame mx-auto w-[280px] sm:w-[320px]">
          <div className="receipt-inner receipt-czech receipt-sheet">
            <ReceiptBodyContent data={data} template={template} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
