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

function effectiveMaxWidth(maxWidthPx: number, fontSizePx: number): number {
  const margin = Math.max(10, Math.round(fontSizePx * 0.15));
  return Math.max(1, maxWidthPx - margin);
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
}

/** Paint black text on transparent canvas → PNG data URL. */
export function textToPngDataUrl(text: string, options: BitmapTextOptions): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const dpr = options.dpr ?? 2;
  const fontWeight = options.fontWeight ?? 700;
  const paddingY = options.paddingY ?? 2;
  const lineGap = options.lineGap ?? 4;
  const align = options.align ?? "left";

  const measure = document.createElement("canvas");
  const mctx = measure.getContext("2d");
  if (!mctx) return "";

  const fontStack = options.fontFamily ?? PRINT_FONT;
  mctx.font = `${fontWeight} ${options.fontSizePx}px ${fontStack}`;
  const wrapWidth = effectiveMaxWidth(options.maxWidthPx, options.fontSizePx);
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

  const x =
    align === "center"
      ? options.maxWidthPx / 2
      : align === "right"
        ? options.maxWidthPx
        : 0;
  lines.forEach((line, index) => {
    ctx.fillText(line, x, paddingY + index * lineHeight);
  });

  return canvas.toDataURL("image/png");
}

type BitmapDrawOptions = Pick<
  BitmapTextOptions,
  "maxWidthPx" | "fontSizePx" | "fontWeight" | "paddingY" | "lineGap" | "dpr" | "fontFamily"
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
  const fullWidth = effectiveMaxWidth(options.maxWidthPx, options.fontSizePx);
  const gap = 8;
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
    ctx.fillText(line, 0, paddingY + index * lineHeight);
    if (index === 0 && trimmedRight) {
      ctx.textAlign = "right";
      ctx.fillText(trimmedRight, options.maxWidthPx, paddingY);
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
      ctx.fillText(leftText, 0, y);
    }
    if (rightText) {
      ctx.textAlign = "right";
      ctx.fillText(rightText, options.maxWidthPx, y);
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
  const contentHeight = lineHeight + paddingY * 2;
  const width = options.maxWidthPx;
  const midX = width * 0.62;
  const rightX = width;

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
  ctx.fillText(leftText.trim(), 0, paddingY);
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

export function bitmapImgHtml(
  dataUrl: string,
  alt: string,
  widthPx: number,
): string {
  if (!dataUrl) return "";
  const safeAlt = alt.replace(/"/g, "&quot;");
  return `<img class="kt-bitmap" src="${dataUrl}" alt="${safeAlt}" width="${widthPx}" style="display:block;width:${widthPx}px;max-width:100%;height:auto;" />`;
}
