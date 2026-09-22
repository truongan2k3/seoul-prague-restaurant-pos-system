/** Monospace receipt line helpers (~42 cols at 58mm Font B). */
export const RECEIPT_LINE_WIDTH = 42;
/** Fixed widths so `Ks × cena` forms one straight right column. */
export const RECEIPT_QTY_COL_WIDTH = 3;
export const RECEIPT_PRICE_COL_WIDTH = 9;

export function padReceiptLine(left: string, right: string, width = RECEIPT_LINE_WIDTH): string {
  const l = left.trim();
  const r = right.trimEnd(); // keep leading pad in right column
  if (!r.trim()) return l;
  if (!l) return r.padStart(width);
  const gap = Math.max(1, width - l.length - r.length);
  if (gap >= 1) return `${l}${" ".repeat(gap)}${r}`;
  return `${l.slice(0, Math.max(1, width - r.length - 1))} ${r}`;
}

/** Word-aware wrap for ESC/POS monospace lines. */
export function wrapReceiptText(text: string, maxWidth: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [""];
  if (trimmed.length <= maxWidth) return [trimmed];

  const lines: string[] = [];
  let rest = trimmed;

  while (rest.length > 0) {
    if (rest.length <= maxWidth) {
      lines.push(rest);
      break;
    }

    let slice = rest.slice(0, maxWidth);
    const lastSpace = slice.lastIndexOf(" ");
    if (lastSpace > 0) {
      slice = rest.slice(0, lastSpace);
      rest = rest.slice(lastSpace + 1);
    } else {
      rest = rest.slice(maxWidth);
    }
    lines.push(slice);
  }

  return lines.length > 0 ? lines : [""];
}

/** Width of the padded `qty × price [tax]` right column. */
export function receiptQtyTimesPriceColumnWidth(includeTax = true): number {
  // "  2 ×   195,00 A" → qty + " × " + price + optional " X"
  return RECEIPT_QTY_COL_WIDTH + 3 + RECEIPT_PRICE_COL_WIDTH + (includeTax ? 2 : 0);
}

/** Item row(s): right column on first line; long names wrap at word boundaries. */
export function receiptItemEscPosLines(
  name: string,
  rightText: string,
  width = RECEIPT_LINE_WIDTH,
): string[] {
  const left = name.trim();
  const right = rightText.trimEnd();
  if (!right.trim()) return wrapReceiptText(left, width);

  const firstLeftMax = Math.max(8, width - right.length - 1);
  if (left.length <= firstLeftMax) {
    return [padReceiptLine(left, right, width)];
  }

  const wrapped = wrapReceiptText(left, firstLeftMax);
  const lines = [padReceiptLine(wrapped[0] ?? "", right, width)];
  for (let i = 1; i < wrapped.length; i += 1) {
    const cont = wrapped[i]?.trim();
    if (cont) lines.push(cont);
  }
  return lines;
}

/** Header: Položka | Ks × cena — right label padded to the same column width. */
export function receiptItemsHeaderEscPosLine(width = RECEIPT_LINE_WIDTH): string {
  const right = "Ks × cena".padStart(receiptQtyTimesPriceColumnWidth());
  return padReceiptLine("Položka", right, width);
}

/** Format quantity for receipt display. */
export function formatReceiptQty(quantity: number): string {
  if (!Number.isFinite(quantity)) return "0";
  if (Number.isInteger(quantity)) return String(quantity);
  return String(quantity);
}

/**
 * Fixed-width right column: `  2 ×   195,00 A`
 * Qty and unit price are padded so every row aligns as one column.
 */
export function formatReceiptQtyTimesPrice(
  quantity: number,
  unitPrice: number,
  taxGroup?: string,
  formatAmount: (n: number) => string = (n) => n.toFixed(2).replace(".", ","),
): string {
  const qty = formatReceiptQty(quantity).padStart(RECEIPT_QTY_COL_WIDTH);
  const price = formatAmount(unitPrice).padStart(RECEIPT_PRICE_COL_WIDTH);
  const tax = taxGroup ? ` ${taxGroup}` : "";
  return `${qty} × ${price}${tax}`;
}

/** Two stacked columns (meta header): left block + right block in one monospace row set. */
export function receiptMetaEscPosLines(
  leftLines: string[],
  rightLines: string[],
  width = RECEIPT_LINE_WIDTH,
): string[] {
  const rows = Math.max(leftLines.length, rightLines.length, 1);
  const lines: string[] = [];
  for (let i = 0; i < rows; i += 1) {
    lines.push(padReceiptLine(leftLines[i] ?? "", rightLines[i] ?? "", width));
  }
  return lines;
}
