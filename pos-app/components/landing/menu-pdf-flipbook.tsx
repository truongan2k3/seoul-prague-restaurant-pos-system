"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { MenuPdfLanguage, WebsiteMenuPdf } from "@/lib/website/types";
import { MENU_PDF_LANGUAGES } from "@/lib/website/defaults";

type PdfJsModule = typeof import("pdfjs-dist");

let pdfWorkerReady = false;

async function getPdfJs(): Promise<PdfJsModule> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfWorkerReady && typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    pdfWorkerReady = true;
  }
  return pdfjs;
}

async function renderPdfToImages(url: string, maxPages = 40): Promise<string[]> {
  const pdfjs = await getPdfJs();
  const task = pdfjs.getDocument({ url, withCredentials: false });
  const doc = await task.promise;
  const pageCount = Math.min(doc.numPages, maxPages);
  const images: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    if (!context) continue;
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.92));
  }

  return images;
}

interface MenuPdfFlipbookProps {
  pdfs: WebsiteMenuPdf[];
  initialLanguage?: MenuPdfLanguage;
}

export function MenuPdfFlipbook({ pdfs, initialLanguage = "cs" }: MenuPdfFlipbookProps) {
  const bookRef = useRef<{ pageFlip: () => { flipNext: () => void; flipPrev: () => void; getCurrentPageIndex: () => number } } | null>(null);
  const [language, setLanguage] = useState<MenuPdfLanguage>(initialLanguage);
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  const activePdf = pdfs.find((row) => row.language === language) ?? pdfs[0];

  const loadPdf = useCallback(async (pdf: WebsiteMenuPdf | undefined) => {
    if (!pdf?.fileUrl) {
      setPages([]);
      return;
    }
    setLoading(true);
    setError(null);
    setPageIndex(0);
    try {
      const images = await renderPdfToImages(pdf.fileUrl);
      if (images.length === 0) {
        setError("Could not render PDF pages.");
        setPages([]);
      } else {
        setPages(images);
      }
    } catch {
      setError("Failed to load menu PDF. Try opening the download link below.");
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activePdf) void loadPdf(activePdf);
  }, [activePdf, loadPdf]);

  if (pdfs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/20 px-6 py-16 text-center text-white/50">
        Menu PDFs have not been uploaded yet. Add Czech, English, and Chinese menus in /admin.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {MENU_PDF_LANGUAGES.map(({ code, label }) => {
          const available = pdfs.some((row) => row.language === code);
          const active = language === code;
          return (
            <button
              key={code}
              type="button"
              disabled={!available}
              onClick={() => setLanguage(code)}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                active
                  ? "bg-[#8B1E2D] text-white"
                  : available
                    ? "border border-white/20 text-white/80 hover:border-white/40"
                    : "border border-white/10 text-white/30"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex min-h-[420px] items-center justify-center text-white/60">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Opening menu book…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-6 py-8 text-center">
          <p className="text-red-200">{error}</p>
          {activePdf ? (
            <a
              href={activePdf.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm text-[#C9A88B] underline"
            >
              Download PDF
            </a>
          ) : null}
        </div>
      ) : pages.length > 0 ? (
        <div className="flex flex-col items-center">
          <div className="relative w-full max-w-4xl">
            {/* @ts-expect-error react-pageflip types are loose */}
            <HTMLFlipBook
              ref={bookRef}
              width={420}
              height={560}
              size="stretch"
              minWidth={280}
              maxWidth={560}
              minHeight={380}
              maxHeight={720}
              showCover
              mobileScrollSupport
              className="menu-flipbook mx-auto shadow-2xl shadow-black/60"
              onFlip={(event: { data: number }) => setPageIndex(event.data)}
            >
              {pages.map((src, index) => (
                <div key={`${language}-page-${index}`} className="menu-book-page bg-[#f5f0ea]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Menu page ${index + 1}`} className="h-full w-full object-contain" />
                </div>
              ))}
            </HTMLFlipBook>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => bookRef.current?.pageFlip().flipPrev()}
              className="rounded-full border border-white/20 p-3 text-white hover:bg-white/10"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm tabular-nums text-white/60">
              {pageIndex + 1} / {pages.length}
            </span>
            <button
              type="button"
              aria-label="Next page"
              onClick={() => bookRef.current?.pageFlip().flipNext()}
              className="rounded-full border border-white/20 p-3 text-white hover:bg-white/10"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {activePdf ? (
            <a
              href={activePdf.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 text-xs uppercase tracking-[0.16em] text-[#C9A88B] hover:text-white"
            >
              Download PDF
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
