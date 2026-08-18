/** Minimal ESC/POS helpers for 80mm thermal printers (Star / Epson compatible). */

import { encodeWindows1250 } from "@/lib/cp1250";

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function escInit(): Uint8Array {
  return new Uint8Array([0x1b, 0x40]);
}

export function escAlign(mode: "left" | "center" | "right"): Uint8Array {
  const n = mode === "center" ? 1 : mode === "right" ? 2 : 0;
  return new Uint8Array([0x1b, 0x61, n]);
}

export function escFeedDots(dots: number): Uint8Array {
  const parts: Uint8Array[] = [];
  let remaining = Math.max(0, Math.floor(dots));
  while (remaining > 0) {
    const chunk = Math.min(255, remaining);
    parts.push(new Uint8Array([0x1b, 0x4a, chunk]));
    remaining -= chunk;
  }
  return parts.length > 0 ? concatBytes(parts) : new Uint8Array();
}

export function escFeed(lines = 1): Uint8Array {
  return new Uint8Array([0x1b, 0x64, Math.max(0, Math.min(255, lines))]);
}

export function escCut(): Uint8Array {
  return new Uint8Array([0x1d, 0x56, 0x00]);
}

/** Select Windows-1250 code page (Central Europe) — ESC t 17 on Epson/Star compatibles. */
export function escSelectCodePage1250(): Uint8Array {
  return new Uint8Array([0x1b, 0x74, 17]);
}

/** Encode Latin/UTF-8 text line (many modern thermals accept UTF-8). */
export function escText(text: string, bold = false): Uint8Array {
  const encoder = new TextEncoder();
  const body = encoder.encode(`${text}\n`);
  if (!bold) return body;
  return concatBytes([new Uint8Array([0x1b, 0x45, 0x01]), body, new Uint8Array([0x1b, 0x45, 0x00])]);
}

/** Text line encoded as Windows-1250 for Czech legacy thermals. */
export function escTextCp1250(text: string, bold = false): Uint8Array {
  const body = encodeWindows1250(`${text}\n`);
  if (!bold) return body;
  return concatBytes([new Uint8Array([0x1b, 0x45, 0x01]), body, new Uint8Array([0x1b, 0x45, 0x00])]);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load print image"));
    img.src = dataUrl;
  });
}

/**
 * Convert a PNG data URL to ESC/POS raster (GS v 0).
 * Width is padded to multiple of 8 for 80mm (~576 dots).
 */
export async function escRasterFromPngDataUrl(dataUrl: string, maxWidth = 576): Promise<Uint8Array> {
  const img = await loadImage(dataUrl);
  const targetWidth = Math.min(maxWidth, Math.ceil(img.width / 8) * 8);
  const scale = targetWidth / img.width;
  const targetHeight = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Uint8Array();

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const { data } = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const widthBytes = targetWidth / 8;
  const raster = new Uint8Array(widthBytes * targetHeight);

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const i = (y * targetWidth + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const on = lum < 180; // dark pixels print
      if (on) {
        raster[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  const header = new Uint8Array([
    0x1d,
    0x76,
    0x30,
    0x00,
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    targetHeight & 0xff,
    (targetHeight >> 8) & 0xff,
  ]);

  return concatBytes([header, raster]);
}

export function escBlankRaster(heightDots: number, widthDots = 576): Uint8Array {
  const targetWidth = Math.min(widthDots, Math.ceil(widthDots / 8) * 8);
  const targetHeight = Math.max(1, Math.floor(heightDots));
  const widthBytes = targetWidth / 8;
  const header = new Uint8Array([
    0x1d,
    0x76,
    0x30,
    0x00,
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    targetHeight & 0xff,
    (targetHeight >> 8) & 0xff,
  ]);
  return concatBytes([header, new Uint8Array(widthBytes * targetHeight)]);
}

export async function buildEscPosFromPngs(
  dataUrls: string[],
  options?: {
    topFeedLines?: number;
    topFeedDots?: number;
    topBlankRasterDots?: number;
    /** When 0, raster strips print back-to-back (receipt tight layout). Default: one line feed between strips. */
    feedBetweenDots?: number;
    bottomBlankRasterDots?: number;
    bottomFeedLines?: number;
    /** ESC/POS raster width in dots (default 576 for 80 mm). */
    rasterWidthDots?: number;
  },
): Promise<Uint8Array> {
  const rasterWidth = options?.rasterWidthDots ?? 576;
  const parts: Uint8Array[] = [escInit(), escAlign("left")];
  if (options?.topBlankRasterDots && options.topBlankRasterDots > 0) {
    parts.push(escBlankRaster(options.topBlankRasterDots));
  } else if (options?.topFeedDots && options.topFeedDots > 0) {
    parts.push(escFeedDots(options.topFeedDots));
  } else if (options?.topFeedLines && options.topFeedLines > 0) {
    parts.push(escFeed(options.topFeedLines));
  }
  const tightRasterGap = options?.feedBetweenDots === 0;
  for (const url of dataUrls) {
    if (!url) continue;
    parts.push(await escRasterFromPngDataUrl(url, rasterWidth));
    if (tightRasterGap) {
      continue;
    }
    if (options?.feedBetweenDots != null && options.feedBetweenDots > 0) {
      parts.push(escFeedDots(options.feedBetweenDots));
    } else {
      parts.push(escFeed(1));
    }
  }
  if (options?.bottomBlankRasterDots && options.bottomBlankRasterDots > 0) {
    parts.push(escBlankRaster(options.bottomBlankRasterDots));
  }
  parts.push(escFeed(options?.bottomFeedLines ?? 6), escCut());
  return concatBytes(parts);
}

export function escFontB(): Uint8Array {
  return new Uint8Array([0x1b, 0x4d, 0x01]);
}

export function escFontA(): Uint8Array {
  return new Uint8Array([0x1b, 0x4d, 0x00]);
}

export function escCharSizeNormal(): Uint8Array {
  return new Uint8Array([0x1d, 0x21, 0x00]);
}

/** Double height — readable receipt text without breaking column width. */
export function escCharSizeDoubleHeight(): Uint8Array {
  return new Uint8Array([0x1d, 0x21, 0x10]);
}

export function buildEscPosFromTextLines(
  lines: string[],
  useCp1250 = true,
  options?: { compactFont?: boolean; readableReceipt?: boolean },
): Uint8Array {
  const parts: Uint8Array[] = [escInit(), escAlign("left")];
  if (options?.readableReceipt) {
    parts.push(escFontA(), escCharSizeDoubleHeight());
  } else if (options?.compactFont !== false) {
    parts.push(escFontB(), escCharSizeNormal());
  }
  if (useCp1250) {
    parts.push(escSelectCodePage1250());
  }
  const writeLine = useCp1250 ? escTextCp1250 : escText;
  for (const line of lines) {
    parts.push(writeLine(line));
  }
  parts.push(escFeed(1), escCut());
  return concatBytes(parts);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
