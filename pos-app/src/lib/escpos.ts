/** Minimal ESC/POS helpers for 80mm thermal printers (Star / Epson compatible). */

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

export function escFeed(lines = 1): Uint8Array {
  return new Uint8Array([0x1b, 0x64, Math.max(0, Math.min(255, lines))]);
}

export function escCut(): Uint8Array {
  return new Uint8Array([0x1d, 0x56, 0x00]);
}

/** Encode Latin/UTF-8 text line (many modern thermals accept UTF-8). */
export function escText(text: string, bold = false): Uint8Array {
  const encoder = new TextEncoder();
  const body = encoder.encode(`${text}\n`);
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

export async function buildEscPosFromPngs(dataUrls: string[]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [escInit(), escAlign("left")];
  for (const url of dataUrls) {
    if (!url) continue;
    parts.push(await escRasterFromPngDataUrl(url));
    parts.push(escFeed(1));
  }
  parts.push(escFeed(3), escCut());
  return concatBytes(parts);
}

export function buildEscPosFromTextLines(lines: string[]): Uint8Array {
  const parts: Uint8Array[] = [escInit(), escAlign("left")];
  for (const line of lines) {
    parts.push(escText(line));
  }
  parts.push(escFeed(3), escCut());
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
