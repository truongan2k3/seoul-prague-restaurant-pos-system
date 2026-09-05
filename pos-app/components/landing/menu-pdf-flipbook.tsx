"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { MenuPdfLanguage, WebsiteMenuPdf } from "@/lib/website/types";
import { MENU_PDF_LANGUAGES } from "@/lib/website/defaults";

type PdfJsModule = typeof import("pdfjs-dist");

let pdfWorkerReady = false;

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;

function proxyPdfUrl(language: MenuPdfLanguage): string {
  return `/api/website/menu-pdf/file?language=${language}`;
}

async function getPdfJs(): Promise<PdfJsModule> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfWorkerReady && typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    pdfWorkerReady = true;
  }
  return pdfjs;
}

function renderScaleForDevice(): number {
  if (typeof window === "undefined") return 2;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  return window.innerWidth >= 1024 ? 2.2 * dpr : 1.6 * dpr;
}

async function renderPdfToImages(url: string, maxPages = 40): Promise<string[]> {
  const pdfjs = await getPdfJs();
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`PDF fetch failed (${response.status})`);
  }
  const data = new Uint8Array(await response.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(doc.numPages, maxPages);
  const images: string[] = [];
  const scale = renderScaleForDevice();

  for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.95));
  }

  return images;
}

function useBookSize() {
  const [size, setSize] = useState({ width: 420, height: 594, maxWidth: 560, maxHeight: 792 });

  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      if (vw >= 1280) {
        setSize({ width: 560, height: 792, maxWidth: 640, maxHeight: 900 });
      } else if (vw >= 1024) {
        setSize({ width: 500, height: 707, maxWidth: 580, maxHeight: 820 });
      } else if (vw >= 768) {
        setSize({ width: 420, height: 594, maxWidth: 480, maxHeight: 680 });
      } else {
        setSize({ width: 320, height: 453, maxWidth: 360, maxHeight: 510 });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return size;
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

interface MenuPdfFlipbookProps {
  pdfs: WebsiteMenuPdf[];
  initialLanguage?: MenuPdfLanguage;
}

export function MenuPdfFlipbook({ pdfs, initialLanguage = "cs" }: MenuPdfFlipbookProps) {
  const bookRef = useRef<{
    pageFlip: () => {
      flipNext: () => void;
      flipPrev: () => void;
      turnToPage: (page: number) => void;
    };
  } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const bookSize = useBookSize();

  const availableLanguages = useMemo(
    () => MENU_PDF_LANGUAGES.filter(({ code }) => pdfs.some((row) => row.language === code)),
    [pdfs],
  );

  const [language, setLanguage] = useState<MenuPdfLanguage>(() => {
    if (pdfs.some((row) => row.language === initialLanguage)) return initialLanguage;
    return pdfs[0]?.language ?? "cs";
  });
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [useSimpleViewer, setUseSimpleViewer] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [expanded, setExpanded] = useState(false);
  const [lightboxPage, setLightboxPage] = useState<number | null>(null);

  const zoomed = zoom > 1.02;
  const activePdf = pdfs.find((row) => row.language === language) ?? pdfs[0];
  const viewerUrl = activePdf ? proxyPdfUrl(activePdf.language) : "";

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    panRef.current = { x: 0, y: 0 };
  }, []);

  const loadPdf = useCallback(
    async (pdf: WebsiteMenuPdf | undefined) => {
      if (!pdf?.fileUrl) {
        setPages([]);
        return;
      }
      setLoading(true);
      setError(null);
      setPageIndex(0);
      setUseSimpleViewer(false);
      resetView();
      setLightboxPage(null);
      try {
        const images = await renderPdfToImages(proxyPdfUrl(pdf.language));
        if (images.length === 0) {
          setError("Could not render PDF pages.");
          setUseSimpleViewer(true);
          setPages([]);
        } else {
          setPages(images);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load menu PDF.");
        setUseSimpleViewer(true);
        setPages([]);
      } finally {
        setLoading(false);
      }
    },
    [resetView],
  );

  useEffect(() => {
    if (activePdf) void loadPdf(activePdf);
  }, [activePdf, loadPdf]);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [expanded]);

  // Wheel zoom scoped to the viewer stage (does not zoom the whole page).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((current) => {
        const next = clampZoom(Number((current + delta).toFixed(2)));
        if (next <= 1) {
          setPan({ x: 0, y: 0 });
          panRef.current = { x: 0, y: 0 };
        }
        return next;
      });
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [loading, pages.length, expanded, useSimpleViewer]);

  // Pinch zoom + pan when zoomed (touch).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const distance = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        pinchRef.current = { distance: distance(event.touches), zoom };
        dragRef.current = null;
        return;
      }
      if (event.touches.length === 1 && zoom > 1.02) {
        const touch = event.touches[0];
        dragRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 2 && pinchRef.current) {
        event.preventDefault();
        const ratio = distance(event.touches) / pinchRef.current.distance;
        const next = clampZoom(pinchRef.current.zoom * ratio);
        setZoom(next);
        if (next <= 1) {
          setPan({ x: 0, y: 0 });
          panRef.current = { x: 0, y: 0 };
        }
        return;
      }
      if (event.touches.length === 1 && dragRef.current && zoom > 1.02) {
        event.preventDefault();
        const touch = event.touches[0];
        const next = {
          x: dragRef.current.panX + (touch.clientX - dragRef.current.x),
          y: dragRef.current.panY + (touch.clientY - dragRef.current.y),
        };
        panRef.current = next;
        setPan(next);
      }
    };

    const onTouchEnd = () => {
      pinchRef.current = null;
      dragRef.current = null;
    };

    stage.addEventListener("touchstart", onTouchStart, { passive: true });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("touchend", onTouchEnd);
    stage.addEventListener("touchcancel", onTouchEnd);
    return () => {
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("touchend", onTouchEnd);
      stage.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [zoom, loading, pages.length, expanded, useSimpleViewer]);

  const zoomIn = () =>
    setZoom((value) => clampZoom(Number((value + ZOOM_STEP).toFixed(2))));
  const zoomOut = () =>
    setZoom((value) => {
      const next = clampZoom(Number((value - ZOOM_STEP).toFixed(2)));
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
        panRef.current = { x: 0, y: 0 };
      }
      return next;
    });

  const goToPage = (index: number) => {
    if (index < 0 || index >= pages.length) return;
    try {
      bookRef.current?.pageFlip().turnToPage(index);
    } catch {
      // ignore when flipbook is not ready
    }
    setPageIndex(index);
  };

  const flipPrev = () => {
    if (zoomed) return;
    bookRef.current?.pageFlip().flipPrev();
  };
  const flipNext = () => {
    if (zoomed) return;
    bookRef.current?.pageFlip().flipNext();
  };

  if (pdfs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/20 px-6 py-16 text-center text-white/50">
        Menu PDFs have not been uploaded yet. Add Czech, English, and Chinese menus in /admin.
      </div>
    );
  }

  const controls = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        aria-label="Zoom out"
        disabled={zoom <= MIN_ZOOM}
        onClick={zoomOut}
        className="rounded-full border border-white/20 p-2.5 text-white hover:bg-white/10 disabled:opacity-40"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={resetView}
        className="min-w-[4.5rem] rounded-full border border-white/20 px-3 py-2 text-xs font-semibold tabular-nums text-white/80 hover:bg-white/10"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        disabled={zoom >= MAX_ZOOM}
        onClick={zoomIn}
        className="rounded-full border border-white/20 p-2.5 text-white hover:bg-white/10 disabled:opacity-40"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={expanded ? "Exit large view" : "Large view"}
        onClick={() => setExpanded((value) => !value)}
        className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/85 hover:bg-white/10"
      >
        {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        {expanded ? "Exit" : "Large view"}
      </button>
    </div>
  );

  const thumbnails =
    pages.length > 0 ? (
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
        {pages.map((src, index) => (
          <button
            key={`thumb-${index}`}
            type="button"
            onClick={() => goToPage(index)}
            aria-label={`Go to page ${index + 1}`}
            className={`relative h-16 w-12 shrink-0 overflow-hidden border transition ${
              pageIndex === index
                ? "border-[#C9A88B] ring-1 ring-[#C9A88B]/60"
                : "border-white/15 opacity-70 hover:opacity-100"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
          </button>
        ))}
      </div>
    ) : null;

  const flipbook =
    pages.length > 0 && !useSimpleViewer ? (
      <div className="flex flex-col items-center gap-5">
        <div
          ref={stageRef}
          className={`relative w-full overflow-hidden touch-none ${
            expanded ? "max-h-[78vh]" : "max-h-[72vh] lg:max-h-none"
          } ${zoomed ? "cursor-grab active:cursor-grabbing" : ""}`}
          onPointerDown={(event) => {
            if (!zoomed || event.pointerType === "touch") return;
            dragRef.current = {
              x: event.clientX,
              y: event.clientY,
              panX: panRef.current.x,
              panY: panRef.current.y,
            };
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!dragRef.current || !zoomed || event.pointerType === "touch") return;
            const next = {
              x: dragRef.current.panX + (event.clientX - dragRef.current.x),
              y: dragRef.current.panY + (event.clientY - dragRef.current.y),
            };
            panRef.current = next;
            setPan(next);
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
        >
          <div
            className="mx-auto origin-center will-change-transform"
            style={{
              width: bookSize.maxWidth * 2,
              maxWidth: "100%",
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: dragRef.current ? undefined : "transform 160ms ease-out",
            }}
          >
            {/* @ts-expect-error react-pageflip types are loose */}
            <HTMLFlipBook
              key={`${language}-${pages.length}-${bookSize.width}`}
              ref={bookRef}
              width={bookSize.width}
              height={bookSize.height}
              size="stretch"
              minWidth={Math.min(280, bookSize.width)}
              maxWidth={bookSize.maxWidth}
              minHeight={Math.min(380, bookSize.height)}
              maxHeight={bookSize.maxHeight}
              showCover
              mobileScrollSupport={!zoomed}
              disableFlipByClick={zoomed}
              className={`menu-flipbook mx-auto shadow-2xl shadow-black/60 ${
                zoomed ? "pointer-events-none" : ""
              }`}
              onFlip={(event: { data: number }) => setPageIndex(event.data)}
            >
              {pages.map((src, index) => (
                <div key={`${language}-page-${index}`} className="menu-book-page bg-[#f5f0ea]">
                  <button
                    type="button"
                    className="h-full w-full cursor-zoom-in"
                    onClick={() => {
                      if (zoomed) return;
                      setLightboxPage(index);
                    }}
                    aria-label={`Enlarge page ${index + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Menu page ${index + 1}`}
                      className="h-full w-full object-contain"
                      draggable={false}
                    />
                  </button>
                </div>
              ))}
            </HTMLFlipBook>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Previous page"
            disabled={zoomed || pageIndex <= 0}
            onClick={flipPrev}
            className="rounded-full border border-white/20 p-3 text-white hover:bg-white/10 disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm tabular-nums text-white/60">
            {pageIndex + 1} / {pages.length}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={zoomed || pageIndex >= pages.length - 1}
            onClick={flipNext}
            className="rounded-full border border-white/20 p-3 text-white hover:bg-white/10 disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {thumbnails}
        {controls}
        <p className="text-center text-xs text-white/40">
          {zoomed
            ? "Zoomed — drag or swipe to pan · pinch / scroll to zoom"
            : "Scroll or pinch to zoom · click a thumbnail to jump · click a page to enlarge"}
        </p>
      </div>
    ) : (
      <div className="space-y-4">
        {error ? (
          <p className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            Flipbook could not render ({error}). Showing PDF viewer instead.
          </p>
        ) : null}
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#121214]">
          <iframe
            title={`${activePdf?.label ?? "Menu"} PDF`}
            src={viewerUrl}
            className="h-[75vh] w-full bg-white lg:h-[85vh]"
          />
        </div>
        {controls}
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {MENU_PDF_LANGUAGES.map(({ code, label }) => {
          const available = availableLanguages.some((row) => row.code === code);
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
        <div className="flex min-h-[420px] items-center justify-center text-white/60 lg:min-h-[640px]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Opening menu book…
        </div>
      ) : expanded ? (
        <div className="fixed inset-0 z-[80] flex flex-col bg-[#0B0B0C]/95 p-4 backdrop-blur-sm lg:p-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-white/70">{activePdf?.label ?? "Menu"} · large view</p>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white hover:bg-white/10"
            >
              <Minimize2 className="h-4 w-4" />
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{flipbook}</div>
        </div>
      ) : (
        flipbook
      )}

      {lightboxPage != null && pages[lightboxPage] ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxPage(null)}
          role="presentation"
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full border border-white/30 px-4 py-2 text-xs uppercase tracking-[0.14em] text-white"
            onClick={() => setLightboxPage(null)}
          >
            Close
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pages[lightboxPage]}
            alt={`Menu page ${lightboxPage + 1} enlarged`}
            className="max-h-[92vh] max-w-[96vw] object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}

      {activePdf ? (
        <div className="text-center">
          <a
            href={viewerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs uppercase tracking-[0.16em] text-[#C9A88B] hover:text-white"
          >
            Open / download PDF
          </a>
        </div>
      ) : null}
    </div>
  );
}
