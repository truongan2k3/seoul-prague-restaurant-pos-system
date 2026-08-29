/** Rasterize ticket text so CJK glyphs survive browser → PDF / 80mm thermal print. */

const PRINT_FONT =
  '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Heiti SC", "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif';

const KITCHEN_FONT_SIZES_PX = [16, 18, 20, 22, 24, 28, 34, 40, 42, 46, 50, 52];

let cjkFontPromise: Promise<void> | null = null;

/** Load Noto Sans SC once in the main window so canvas can paint Chinese. */
export function ensureCjkPrintFont(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (cjkFontPromise) return cjkFontPromise;

  cjkFontPromise = (async () => {
    const styleId = "pos-cjk-print-font";
    if (!document.getElementById(styleId)) {
      const link = document.createElement("link");
      link.id = styleId;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap";
      document.head.appendChild(link);
      await new Promise<void>((resolve) => {
        link.addEventListener("load", () => resolve(), { once: true });
        link.addEventListener("error", () => resolve(), { once: true });
        window.setTimeout(() => resolve(), 2500);
      });
    }

    try {
      const loads = KITCHEN_FONT_SIZES_PX.flatMap((size) => [
        document.fonts.load(`400 ${size}px ${PRINT_FONT}`),
        document.fonts.load(`600 ${size}px ${PRINT_FONT}`),
        document.fonts.load(`700 ${size}px ${PRINT_FONT}`),
      ]);
      await Promise.all(loads);
    } catch {
      // system CJK fallbacks may still work on canvas
    }
    await document.fonts.ready;
  })();

  return cjkFontPromise;
}

export function containsCjk(text: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(text);
}

function effectiveMaxWidth(
  maxWidthPx: number,
  fontSizePx: number,
  horizontalPad: BitmapHorizontalPad | undefined,
): number {
  const pad = resolveBitmapHorizontalPad(horizontalPad);
  const inset = pad.left + pad.right;
  const margin =
    inset > 0
      ? Math.max(4, Math.round(fontSizePx * 0.06))
      : Math.max(10, Math.round(fontSizePx * 0.15));
  return Math.max(1, maxWidthPx - inset - margin);
}

function bitmapX(
  align: "left" | "center" | "right",
  maxWidthPx: number,
  horizontalPad: BitmapHorizontalPad | undefined,
): number {
  const pad = resolveBitmapHorizontalPad(horizontalPad);
  const contentWidth = maxWidthPx - pad.left - pad.right;
  if (align === "center") return pad.left + contentWidth / 2;
  if (align === "right") return maxWidthPx - pad.right;
  return pad.left;
}

function breakLongSegment(
  ctx: CanvasRenderingContext2D,
  segment: string,
  maxWidth: number,
): string[] {
  const chars = Array.from(segment);
  if (chars.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const ch of chars) {
    const next = current + ch;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
}

/** Word-aware wrap with char fallback so long kitchen lines never clip at canvas edge. */
export function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return [""];

  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }

    const parts = paragraph.split(/(\s+|[·•\-–—/])/);
    let line = "";

    const flushLine = () => {
      const trimmed = line.trimEnd();
      if (trimmed) lines.push(trimmed);
      line = "";
    };

    for (const part of parts) {
      if (!part) continue;

      const candidate = line + part;
      if (!line || ctx.measureText(candidate).width <= maxWidth) {
        if (line || ctx.measureText(part).width <= maxWidth) {
          line = candidate;
          continue;
        }
      }

      flushLine();
      const trimmedPart = part.trimStart();
      if (ctx.measureText(trimmedPart).width <= maxWidth) {
        line = trimmedPart;
        continue;
      }

      const broken = breakLongSegment(ctx, trimmedPart, maxWidth);
      if (broken.length > 1) {
        lines.push(...broken.slice(0, -1));
        line = broken[broken.length - 1] ?? "";
      } else if (broken.length === 1) {
        line = broken[0] ?? "";
      }
    }

    flushLine();
  }

  return lines.length > 0 ? lines : [""];
}

export type BitmapHorizontalPad = number | { left: number; right: number };

export function resolveBitmapHorizontalPad(
  pad: BitmapHorizontalPad | undefined,
): { left: number; right: number } {
  if (pad == null) return { left: 0, right: 0 };
  if (typeof pad === "number") return { left: pad, right: pad };
  return pad;
}

export interface BitmapTextOptions {
  /** CSS pixel width of the bitmap (content width for 80mm ≈ 560). */
  maxWidthPx: number;
  fontSizePx: number;
  fontWeight?: 400 | 600 | 700;
  align?: "left" | "center" | "right";
  paddingY?: number;
  lineGap?: number;
  /** When false, render as a single line (no auto-wrap). */
  wrap?: boolean;
  /** Device pixel ratio for sharp thermal / PDF output. */
  dpr?: number;
  /** Override canvas font stack (defaults to kitchen CJK stack). */
  fontFamily?: string;
  /** Horizontal inset — number applies both sides; legacy receipts use larger right inset. */
  horizontalPad?: BitmapHorizontalPad;
}

/** Native 72mm thermal width (~576 dots) — match ESC/POS raster 1:1. */
export { DEFAULT_RECEIPT_PAPER_WIDTH_MM, receiptRasterWidthDots } from "@/lib/receipt-raster";
export const RECEIPT_RASTER_WIDTH_PX = 576;
export const RECEIPT_BITMAP_DPR = 1;
/** Legacy thermal printers often clip the right edge — keep text inset on that side. */
export const RECEIPT_BITMAP_H_PAD_LEFT = 4;
export const RECEIPT_BITMAP_H_PAD_RIGHT = 28;
/** @deprecated Use RECEIPT_BITMAP_H_PAD_LEFT / RECEIPT_BITMAP_H_PAD_RIGHT */
export const RECEIPT_BITMAP_H_PAD = RECEIPT_BITMAP_H_PAD_LEFT;

export const RECEIPT_BITMAP_HORIZONTAL_PAD: BitmapHorizontalPad = {
  left: RECEIPT_BITMAP_H_PAD_LEFT,
  right: RECEIPT_BITMAP_H_PAD_RIGHT,
};

/** Paint black text on transparent canvas → PNG data URL. */
export function textToPngDataUrl(text: string, options: BitmapTextOptions): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const dpr = options.dpr ?? 2;
  const fontWeight = options.fontWeight ?? 700;
  const paddingY = options.paddingY ?? 2;
  const lineGap = options.lineGap ?? 4;
  const align = options.align ?? "left";
  const horizontalPad = options.horizontalPad;

  const measure = document.createElement("canvas");
  const mctx = measure.getContext("2d");
  if (!mctx) return "";

  const fontStack = options.fontFamily ?? PRINT_FONT;
  mctx.font = `${fontWeight} ${options.fontSizePx}px ${fontStack}`;
  const wrapWidth = effectiveMaxWidth(options.maxWidthPx, options.fontSizePx, horizontalPad);
  const lines =
    options.wrap === false ? [trimmed] : wrapTextLines(mctx, trimmed, wrapWidth);
  const lineHeight = options.fontSizePx + lineGap;
  const contentHeight = lines.length * lineHeight + paddingY * 2;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(options.maxWidthPx * dpr);
  canvas.height = Math.ceil(contentHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, options.maxWidthPx, contentHeight);
  ctx.fillStyle = "#000000";
  ctx.font = `${fontWeight} ${options.fontSizePx}px ${fontStack}`;
  ctx.textBaseline = "top";
  ctx.textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";

  const x = bitmapX(align, options.maxWidthPx, horizontalPad);
  lines.forEach((line, index) => {
    ctx.fillText(line, x, paddingY + index * lineHeight);
  });

  return canvas.toDataURL("image/png");
}

type BitmapDrawOptions = Pick<
  BitmapTextOptions,
  "maxWidthPx" | "fontSizePx" | "fontWeight" | "paddingY" | "lineGap" | "dpr" | "fontFamily" | "horizontalPad"
>;

function bitmapFont(ctx: CanvasRenderingContext2D, options: BitmapDrawOptions): string {
  const fontWeight = options.fontWeight ?? 700;
  const fontStack = options.fontFamily ?? PRINT_FONT;
  ctx.font = `${fontWeight} ${options.fontSizePx}px ${fontStack}`;
  return fontStack;
}

function lineMetrics(options: BitmapDrawOptions) {
  const paddingY = options.paddingY ?? 2;
  const lineGap = options.lineGap ?? 4;
  const lineHeight = options.fontSizePx + lineGap;
  return { paddingY, lineGap, lineHeight };
}

/** Left + right text on one row; left side wraps, amount stays on the first line. */
export function textToPngItemRowDataUrl(
  leftText: string,
  rightText: string,
  options: BitmapDrawOptions,
): string {
  const trimmedLeft = leftText.trim();
  const trimmedRight = rightText.trim();
  if (!trimmedLeft && !trimmedRight) return "";

  const dpr = options.dpr ?? 2;
  const measure = document.createElement("canvas");
  const mctx = measure.getContext("2d");
  if (!mctx) return "";

  bitmapFont(mctx, options);
  const { paddingY, lineHeight } = lineMetrics(options);
  const pad = resolveBitmapHorizontalPad(options.horizontalPad);
  const fullWidth = effectiveMaxWidth(options.maxWidthPx, options.fontSizePx, options.horizontalPad);
  const gap = 10;
  const rightWidth = trimmedRight ? mctx.measureText(trimmedRight).width : 0;
  const leftWrapWidth = Math.max(40, fullWidth - rightWidth - (trimmedRight ? gap : 0));
  const leftLines = trimmedLeft ? wrapTextLines(mctx, trimmedLeft, leftWrapWidth) : [""];
  const rowCount = Math.max(leftLines.length, 1);
  const contentHeight = rowCount * lineHeight + paddingY * 2;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(options.maxWidthPx * dpr);
  canvas.height = Math.ceil(contentHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, options.maxWidthPx, contentHeight);
  ctx.fillStyle = "#000000";
  bitmapFont(ctx, options);
  ctx.textBaseline = "top";

  leftLines.forEach((line, index) => {
    ctx.textAlign = "left";
    ctx.fillText(line, pad.left, paddingY + index * lineHeight);
    if (index === 0 && trimmedRight) {
      ctx.textAlign = "right";
      ctx.fillText(trimmedRight, options.maxWidthPx - pad.right, paddingY);
    }
  });

  return canvas.toDataURL("image/png");
}

/** Two columns of stacked lines (Tel/Stůl left, Datum/Čas right) in one PNG strip. */
export function textToPngTwoColumnDataUrl(
  leftLines: string[],
  rightLines: string[],
  options: BitmapDrawOptions,
): string {
  const left = leftLines.map((line) => line.trim()).filter(Boolean);
  const right = rightLines.map((line) => line.trim()).filter(Boolean);
  if (left.length === 0 && right.length === 0) return "";

  const dpr = options.dpr ?? 2;
  const measure = document.createElement("canvas");
  const mctx = measure.getContext("2d");
  if (!mctx) return "";

  bitmapFont(mctx, options);
  const { paddingY, lineHeight } = lineMetrics(options);
  const pad = resolveBitmapHorizontalPad(options.horizontalPad);
  const rowCount = Math.max(left.length, right.length, 1);
  const contentHeight = rowCount * lineHeight + paddingY * 2;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(options.maxWidthPx * dpr);
  canvas.height = Math.ceil(contentHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, options.maxWidthPx, contentHeight);
  ctx.fillStyle = "#000000";
  bitmapFont(ctx, options);
  ctx.textBaseline = "top";

  for (let i = 0; i < rowCount; i += 1) {
    const y = paddingY + i * lineHeight;
    const leftText = left[i] ?? "";
    const rightText = right[i] ?? "";
    if (leftText) {
      ctx.textAlign = "left";
      ctx.fillText(leftText, pad.left, y);
    }
    if (rightText) {
      ctx.textAlign = "right";
      ctx.fillText(rightText, options.maxWidthPx - pad.right, y);
    }
  }

  return canvas.toDataURL("image/png");
}

/** Single row with left and right text (totals, column headers). */
export function textToPngSplitRowDataUrl(
  leftText: string,
  rightText: string,
  options: BitmapDrawOptions,
): string {
  return textToPngItemRowDataUrl(leftText, rightText, options);
}

/** Three columns for VAT grid rows. */
export function textToPngThreeColumnDataUrl(
  leftText: string,
  midText: string,
  rightText: string,
  options: BitmapDrawOptions,
): string {
  const dpr = options.dpr ?? 2;
  const measure = document.createElement("canvas");
  const mctx = measure.getContext("2d");
  if (!mctx) return "";

  bitmapFont(mctx, options);
  const { paddingY, lineHeight } = lineMetrics(options);
  const pad = resolveBitmapHorizontalPad(options.horizontalPad);
  const contentHeight = lineHeight + paddingY * 2;
  const width = options.maxWidthPx;
  const contentWidth = width - pad.left - pad.right;
  const midX = pad.left + contentWidth * 0.62;
  const rightX = width - pad.right;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(contentHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, contentHeight);
  ctx.fillStyle = "#000000";
  bitmapFont(ctx, options);
  ctx.textBaseline = "top";

  ctx.textAlign = "left";
  ctx.fillText(leftText.trim(), pad.left, paddingY);
  ctx.textAlign = "right";
  ctx.fillText(midText.trim(), midX, paddingY);
  ctx.fillText(rightText.trim(), rightX, paddingY);

  return canvas.toDataURL("image/png");
}

export function blankPngDataUrl(widthPx: number, heightPx: number, dpr = 2): string {
  if (widthPx <= 0 || heightPx <= 0) return "";
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(widthPx * dpr);
  canvas.height = Math.ceil(heightPx * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, widthPx, heightPx);
  return canvas.toDataURL("image/png");
}

/** Full-width solid or dashed rule — matches CSS receipt preview separators. */
export function ruleToPngDataUrl(options: {
  maxWidthPx: number;
  horizontalPad?: BitmapHorizontalPad;
  thickness?: number;
  style?: "solid" | "dashed";
  paddingY?: number;
  dpr?: number;
}): string {
  const dpr = options.dpr ?? 1;
  const thickness = Math.max(1, options.thickness ?? 2);
  const paddingY = options.paddingY ?? 4;
  const pad = resolveBitmapHorizontalPad(options.horizontalPad);
  const contentHeight = thickness + paddingY * 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(options.maxWidthPx * dpr);
  canvas.height = Math.ceil(contentHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, options.maxWidthPx, contentHeight);
  ctx.fillStyle = "#000000";

  const x0 = pad.left;
  const x1 = options.maxWidthPx - pad.right;
  const y = paddingY;
  if (x1 <= x0) return canvas.toDataURL("image/png");

  if (options.style === "dashed") {
    const dash = 6;
    const gap = 4;
    let x = x0;
    while (x < x1) {
      const w = Math.min(dash, x1 - x);
      ctx.fillRect(x, y, w, thickness);
      x += dash + gap;
    }
  } else {
    ctx.fillRect(x0, y, x1 - x0, thickness);
  }

  return canvas.toDataURL("image/png");
}

export function bitmapImgHtml(
  dataUrl: string,
  alt: string,
  widthPx: number,
): string {
  if (!dataUrl) return "";
  const safeAlt = alt.replace(/"/g, "&quot;");
  return `<img class="kt-bitmap" src="${dataUrl}" alt="${safeAlt}" width="${widthPx}" style="display:block;width:${widthPx}px;max-width:100%;height:auto;" />`;
}
