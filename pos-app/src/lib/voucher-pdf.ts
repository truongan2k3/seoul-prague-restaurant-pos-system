import { deflateSync, inflateSync } from "node:zlib";

interface DecodedPng {
  width: number;
  height: number;
  rgb: Buffer;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode an 8-bit non-interlaced PNG (RGBA/RGB/Gray/Gray+Alpha) into solid 24-bit RGB bytes.
 * Alpha channels are composited against `bgRgb` (defaults to deep charcoal #0b0a09).
 */
export function decodePngToRgb(
  pngBuffer: Uint8Array,
  bgRgb: readonly [number, number, number] = [11, 10, 9],
): DecodedPng {
  const buf = Buffer.isBuffer(pngBuffer) ? pngBuffer : Buffer.from(pngBuffer);
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error("Invalid PNG signature.");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];

  let offset = 8;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buf.length) break;

    if (type === "IHDR") {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      bitDepth = buf[dataStart + 8];
      colorType = buf[dataStart + 9];
      interlace = buf[dataStart + 12];
    } else if (type === "IDAT") {
      idatChunks.push(buf.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || idatChunks.length === 0) {
    throw new Error("Incomplete PNG image data.");
  }
  if (bitDepth !== 8 || interlace !== 0) {
    throw new Error(`Unsupported PNG format (depth=${bitDepth}, interlace=${interlace}).`);
  }

  const channels =
    colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
  if (!channels) {
    throw new Error(`Unsupported PNG colorType=${colorType}.`);
  }

  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const expectedLen = height * (1 + stride);
  if (raw.length < expectedLen) {
    throw new Error("Truncated PNG scanline stream.");
  }

  const unfiltered = Buffer.allocUnsafe(height * stride);
  for (let y = 0; y < height; y++) {
    const rowIn = y * (1 + stride);
    const filter = raw[rowIn];
    const rowOut = y * stride;
    const prevRowOut = (y - 1) * stride;

    for (let x = 0; x < stride; x++) {
      const val = raw[rowIn + 1 + x];
      const a = x >= channels ? unfiltered[rowOut + x - channels] : 0;
      const b = y > 0 ? unfiltered[prevRowOut + x] : 0;
      const c = y > 0 && x >= channels ? unfiltered[prevRowOut + x - channels] : 0;

      let recon = val;
      if (filter === 1) recon = (val + a) & 0xff;
      else if (filter === 2) recon = (val + b) & 0xff;
      else if (filter === 3) recon = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) recon = (val + paethPredictor(a, b, c)) & 0xff;
      unfiltered[rowOut + x] = recon;
    }
  }

  const rgb = Buffer.allocUnsafe(width * height * 3);
  const [bgR, bgG, bgB] = bgRgb;

  if (colorType === 2) {
    unfiltered.copy(rgb);
  } else if (colorType === 6) {
    for (let i = 0, j = 0; i < unfiltered.length; i += 4, j += 3) {
      const a = unfiltered[i + 3];
      if (a === 255) {
        rgb[j] = unfiltered[i];
        rgb[j + 1] = unfiltered[i + 1];
        rgb[j + 2] = unfiltered[i + 2];
      } else if (a === 0) {
        rgb[j] = bgR;
        rgb[j + 1] = bgG;
        rgb[j + 2] = bgB;
      } else {
        const inv = 255 - a;
        rgb[j] = Math.round((unfiltered[i] * a + bgR * inv) / 255);
        rgb[j + 1] = Math.round((unfiltered[i + 1] * a + bgG * inv) / 255);
        rgb[j + 2] = Math.round((unfiltered[i + 2] * a + bgB * inv) / 255);
      }
    }
  } else if (colorType === 0) {
    for (let i = 0, j = 0; i < unfiltered.length; i++, j += 3) {
      const g = unfiltered[i];
      rgb[j] = g;
      rgb[j + 1] = g;
      rgb[j + 2] = g;
    }
  } else {
    // colorType === 4 (Gray + Alpha)
    for (let i = 0, j = 0; i < unfiltered.length; i += 2, j += 3) {
      const g = unfiltered[i];
      const a = unfiltered[i + 1];
      const inv = 255 - a;
      rgb[j] = Math.round((g * a + bgR * inv) / 255);
      rgb[j + 1] = Math.round((g * a + bgG * inv) / 255);
      rgb[j + 2] = Math.round((g * a + bgB * inv) / 255);
    }
  }

  return { width, height, rgb };
}

/**
 * Build a multi-page PDF containing the provided PNG buffers (1 full-bleed card per page).
 * For a 2-sided gift voucher, pass `[frontPng, backPng]` (or `[front1, back1, front2, back2]`).
 * Pure Node/TypeScript (PDF 1.4 / FlateDecode RGB XObjects) — zero native dependencies.
 */
export function buildPdfFromPngPages(
  pngPages: Uint8Array[],
  options?: { pageWidthPt?: number; bgRgb?: readonly [number, number, number] },
): Buffer {
  if (pngPages.length === 0) {
    throw new Error("At least one page image is required to build a PDF.");
  }
  const pageWidthPt = options?.pageWidthPt ?? 595; // A4 portrait width in points (72 DPI)
  const decoded = pngPages.map((png) => decodePngToRgb(png, options?.bgRgb));

  // Object layout:
  // 1: Catalog
  // 2: Pages
  // For each page i (0..N-1):
  //   pageObj = 3 + i * 3
  //   contentObj = 4 + i * 3
  //   imageObj = 5 + i * 3
  const objects: Buffer[] = [];
  const pageRefs: string[] = [];

  for (let i = 0; i < decoded.length; i++) {
    pageRefs.push(`${3 + i * 3} 0 R`);
  }

  objects.push(Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "ascii"));
  objects.push(
    Buffer.from(
      `2 0 obj\n<< /Type /Pages /Count ${decoded.length} /Kids [ ${pageRefs.join(" ")} ] >>\nendobj\n`,
      "ascii",
    ),
  );

  for (let i = 0; i < decoded.length; i++) {
    const img = decoded[i]!;
    const pageH = Number(((pageWidthPt * img.height) / img.width).toFixed(2));
    const pageObjId = 3 + i * 3;
    const contentObjId = 4 + i * 3;
    const imageObjId = 5 + i * 3;

    const compressed = deflateSync(img.rgb, { level: 6 });
    const streamCmd = `q\n${pageWidthPt} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;

    objects.push(
      Buffer.from(
        `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageH}] /Resources << /XObject << /Im0 ${imageObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`,
        "ascii",
      ),
    );
    objects.push(
      Buffer.from(
        `${contentObjId} 0 obj\n<< /Length ${Buffer.byteLength(streamCmd, "ascii")} >>\nstream\n${streamCmd}endstream\nendobj\n`,
        "ascii",
      ),
    );

    const imgHeader = Buffer.from(
      `${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
      "ascii",
    );
    const imgFooter = Buffer.from("\nendstream\nendobj\n", "ascii");
    objects.push(Buffer.concat([imgHeader, compressed, imgFooter]));
  }

  const header = Buffer.from("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n", "binary");
  const chunks: Buffer[] = [header];
  const offsets: number[] = [0];
  let cursor = header.length;

  for (const obj of objects) {
    offsets.push(cursor);
    chunks.push(obj);
    cursor += obj.length;
  }

  const xrefStart = cursor;
  const xrefLines = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n"];
  for (let i = 1; i <= objects.length; i++) {
    xrefLines.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xrefLines.join("") + trailer, "ascii"));

  return Buffer.concat(chunks);
}
