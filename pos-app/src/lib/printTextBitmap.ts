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
function wrapLines(
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
  align?: "left" | "center";
  paddingY?: number;
  lineGap?: number;
  /** Device pixel ratio for sharp thermal / PDF output. */
  dpr?: number;
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

  mctx.font = `${fontWeight} ${options.fontSizePx}px ${PRINT_FONT}`;
  const wrapWidth = effectiveMaxWidth(options.maxWidthPx, options.fontSizePx);
  const lines = wrapLines(mctx, trimmed, wrapWidth);
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
  ctx.font = `${fontWeight} ${options.fontSizePx}px ${PRINT_FONT}`;
  ctx.textBaseline = "top";
  ctx.textAlign = align === "center" ? "center" : "left";

  const x = align === "center" ? options.maxWidthPx / 2 : 0;
  lines.forEach((line, index) => {
    ctx.fillText(line, x, paddingY + index * lineHeight);
  });

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
