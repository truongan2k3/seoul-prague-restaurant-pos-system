import type { MenuPdfLanguage, WebsiteMenuPdf } from "@/lib/website/types";

/** English first when no custom admin order exists. */
export const MENU_PDF_DEFAULT_ORDER: Record<MenuPdfLanguage, number> = {
  en: 0,
  cs: 1,
  zh: 2,
};

export function hasCustomMenuPdfOrder(pdfs: Pick<WebsiteMenuPdf, "sortOrder">[]): boolean {
  if (pdfs.length === 0) return false;
  // Custom order: any non-zero sort_order, or distinct values that aren't all default zeros.
  const orders = pdfs.map((row) => Number(row.sortOrder ?? 0));
  if (orders.some((value) => value !== 0)) return true;
  return false;
}

export function sortMenuPdfs<T extends Pick<WebsiteMenuPdf, "language" | "sortOrder">>(
  pdfs: T[],
): T[] {
  const custom = hasCustomMenuPdfOrder(pdfs);
  return [...pdfs].sort((a, b) => {
    if (custom) {
      const diff = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);
      if (diff !== 0) return diff;
    } else {
      const diff =
        (MENU_PDF_DEFAULT_ORDER[a.language] ?? 99) -
        (MENU_PDF_DEFAULT_ORDER[b.language] ?? 99);
      if (diff !== 0) return diff;
    }
    return a.language.localeCompare(b.language);
  });
}

export function defaultSortOrderForLanguage(language: MenuPdfLanguage): number {
  return MENU_PDF_DEFAULT_ORDER[language] ?? 99;
}
