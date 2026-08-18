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

/** Item row(s): amount on the first line; long names continue below. */
export function receiptItemEscPosLines(
  code: string,
  name: string,
  amount: string,
  width = RECEIPT_LINE_WIDTH,
): string[] {
  const left = `${code} ${name}`.trim();
  const right = amount.trim();
  if (left.length + right.length + 1 <= width) {
    return [padReceiptLine(left, right, width)];
  }
  const lines: string[] = [];
  const firstLeftMax = Math.max(8, width - right.length - 1);
  lines.push(padReceiptLine(left.slice(0, firstLeftMax), right, width));
  let rest = left.slice(firstLeftMax).trimStart();
  while (rest.length > 0) {
    lines.push(rest.slice(0, width));
    rest = rest.slice(width).trimStart();
  }
  return lines;
}
