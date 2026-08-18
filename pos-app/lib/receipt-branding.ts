/** Which branding lines appear on printed / preview receipts. */
export interface ReceiptBrandingVisibility {
  showHeaderTitle: boolean;
  showBrandAddress: boolean;
  showLegalName: boolean;
  showCompanyAddress: boolean;
  showIcoDic: boolean;
  showPhone: boolean;
  showFooter: boolean;
}

export const DEFAULT_RECEIPT_BRANDING_VISIBILITY: ReceiptBrandingVisibility = {
  showHeaderTitle: true,
  showBrandAddress: true,
  showLegalName: true,
  showCompanyAddress: true,
  showIcoDic: true,
  showPhone: true,
  showFooter: true,
};

export function parseReceiptBrandingVisibility(value: unknown): ReceiptBrandingVisibility {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_RECEIPT_BRANDING_VISIBILITY };
  }
  const row = value as Record<string, unknown>;
  return {
    showHeaderTitle: row.showHeaderTitle !== false,
    showBrandAddress: row.showBrandAddress !== false,
    showLegalName: row.showLegalName !== false,
    showCompanyAddress: row.showCompanyAddress !== false,
    showIcoDic: row.showIcoDic !== false,
    showPhone: row.showPhone !== false,
    showFooter: row.showFooter !== false,
  };
}
