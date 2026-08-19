/** Monospace receipt line helpers (~42 cols at 58mm Font B). */
export const RECEIPT_LINE_WIDTH = 42;

export function padReceiptLine(left: string, right: string, width = RECEIPT_LINE_WIDTH): string {
  const l = left.trim();
  const r = right.trim();
  if (!r) return l;
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

/** Item row(s): price on first line; long names wrap at word boundaries. */
export function receiptItemEscPosLines(
  name: string,
  amount: string,
  width = RECEIPT_LINE_WIDTH,
): string[] {
  const left = name.trim();
  const right = amount.trim();
  if (!right) return wrapReceiptText(left, width);

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
