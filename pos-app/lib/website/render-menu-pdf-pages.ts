"use client";

/**
 * Rasterize a menu PDF to JPEG page images in the admin browser.
 * Guests then load these images instead of re-downloading the full PDF.
 */
export async function renderMenuPdfPages(
  file: File,
  options?: { maxPages?: number; scale?: number; quality?: number },
): Promise<{ blobs: Blob[]; pageCount: number }> {
  const maxPages = options?.maxPages ?? 40;
  const scale = options?.scale ?? 2;
  const quality = options?.quality ?? 0.88;

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(doc.numPages, maxPages);
  const blobs: Blob[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/jpeg", quality);
    });
    if (!blob) {
      throw new Error(`Could not encode page ${pageNum} as JPEG.`);
    }
    blobs.push(blob);
  }

  return { blobs, pageCount: doc.numPages };
}
