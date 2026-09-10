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
const LIGHTBOX_MAX_ZOOM = 5;
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
  if (typeof window === "undefined") return 1.5;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // Keep readable without downloading/rendering at near-print resolution.
  return window.innerWidth >= 1024 ? 1.6 * dpr : 1.25 * dpr;
}

/** In-tab cache so CS/EN/ZH toggles do not re-download the same PDF. */
const renderedPdfCache = new Map<string, string[]>();

async function renderPdfToImages(url: string, maxPages = 40): Promise<string[]> {
  const cached = renderedPdfCache.get(url);
  if (cached) return cached;

  const pdfjs = await getPdfJs();
  const response = await fetch(url, { cache: "force-cache" });
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
    images.push(canvas.toDataURL("image/jpeg", 0.88));
  }

  renderedPdfCache.set(url, images);
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

function clampZoom(value: number, max = MAX_ZOOM) {
  return Math.min(max, Math.max(MIN_ZOOM, value));
}

/** Fullscreen page detail: free zoom/pan + prev/next. */
function MenuPageLightbox({
  pages,
  pageIndex,
  onClose,
  onChangePage,
  label,
}: {
  pages: string[];
  pageIndex: number;
  onClose: () => void;
  onChangePage: (index: number) => void;
  label?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomed = zoom > 1.02;
  const src = pages[pageIndex];

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    panRef.current = { x: 0, y: 0 };
  }, []);

  useEffect(() => {
    resetView();
  }, [pageIndex, resetView]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onChangePage(Math.max(0, pageIndex - 1));
      if (event.key === "ArrowRight") onChangePage(Math.min(pages.length - 1, pageIndex + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onChangePage, pageIndex, pages.length]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((current) => {
        const next = clampZoom(Number((current + delta).toFixed(2)), LIGHTBOX_MAX_ZOOM);
        if (next <= 1) {
          setPan({ x: 0, y: 0 });
          panRef.current = { x: 0, y: 0 };
        }
        return next;
      });
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

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
        const next = clampZoom(pinchRef.current.zoom * ratio, LIGHTBOX_MAX_ZOOM);
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
  }, [zoom]);

  if (!src) return null;

  const zoomIn = () =>
    setZoom((value) => clampZoom(Number((value + ZOOM_STEP).toFixed(2)), LIGHTBOX_MAX_ZOOM));
  const zoomOut = () =>
    setZoom((value) => {
      const next = clampZoom(Number((value - ZOOM_STEP).toFixed(2)), LIGHTBOX_MAX_ZOOM);
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
        panRef.current = { x: 0, y: 0 };
      }
      return next;
    });

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/95" role="dialog" aria-modal="true">
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p className="truncate text-sm text-white/70">
          {label ? `${label} · ` : ""}
          {pageIndex + 1} / {pages.length}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom <= MIN_ZOOM}
            onClick={zoomOut}
            className="rounded-full border border-white/25 p-2.5 text-white hover:bg-white/10 disabled:opacity-40"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="min-w-[4rem] rounded-full border border-white/25 px-3 py-2 text-xs font-semibold tabular-nums text-white/85 hover:bg-white/10"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom >= LIGHTBOX_MAX_ZOOM}
            onClick={zoomIn}
            className="rounded-full border border-white/25 p-2.5 text-white hover:bg-white/10 disabled:opacity-40"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/30 px-4 py-2 text-xs uppercase tracking-[0.14em] text-white hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`relative min-h-0 flex-1 touch-none overflow-hidden ${
          zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-default"
        }`}
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
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Menu page ${pageIndex + 1} enlarged`}
          className="absolute left-1/2 top-1/2 max-h-[min(92vh,100%)] max-w-[min(96vw,100%)] origin-center object-contain shadow-2xl will-change-transform select-none"
          style={{
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            transition: dragRef.current ? undefined : "transform 160ms ease-out",
          }}
          draggable={false}
        />

        <button
          type="button"
          aria-label="Previous page"
          disabled={pageIndex <= 0}
          onClick={(event) => {
            event.stopPropagation();
            onChangePage(pageIndex - 1);
          }}
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/30 bg-black/50 p-3 text-white backdrop-blur-sm hover:bg-black/70 disabled:opacity-30 sm:left-4 sm:p-3.5"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          type="button"
          aria-label="Next page"
          disabled={pageIndex >= pages.length - 1}
          onClick={(event) => {
            event.stopPropagation();
            onChangePage(pageIndex + 1);
          }}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/30 bg-black/50 p-3 text-white backdrop-blur-sm hover:bg-black/70 disabled:opacity-30 sm:right-4 sm:p-3.5"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      <p className="shrink-0 px-4 py-3 text-center text-xs text-white/45">
        Pinch or scroll to zoom · drag to pan · arrows change page
      </p>
    </div>
  );
}

interface MenuPdfFlipbookProps {
  pdfs: WebsiteMenuPdf[];
  initialLanguage?: MenuPdfLanguage;
}

function pickInitialMenuLanguage(
  pdfs: WebsiteMenuPdf[],
  preferred: MenuPdfLanguage,
): MenuPdfLanguage {
  if (pdfs.some((row) => row.language === preferred)) return preferred;
  if (pdfs.some((row) => row.language === "en")) return "en";
  return pdfs[0]?.language ?? "en";
}

export function MenuPdfFlipbook({ pdfs, initialLanguage = "en" }: MenuPdfFlipbookProps) {
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

  const [language, setLanguage] = useState<MenuPdfLanguage>(() =>
    pickInitialMenuLanguage(pdfs, initialLanguage),
  );
  const [shouldLoadPdf, setShouldLoadPdf] = useState(false);
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
    if (!shouldLoadPdf || !activePdf) return;
    void loadPdf(activePdf);
  }, [shouldLoadPdf, activePdf, loadPdf]);

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

  const openLightbox = (index: number) => {
    if (index < 0 || index >= pages.length) return;
    setPageIndex(index);
    setLightboxPage(index);
  };

  const goToPage = (index: number) => {
    if (index < 0 || index >= pages.length) return;
    try {
      bookRef.current?.pageFlip().turnToPage(index);
    } catch {
      // ignore when flipbook is not ready
    }
    setPageIndex(index);
    setLightboxPage((current) => (current == null ? current : index));
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
        aria-label="Open enlarged page"
        onClick={() => openLightbox(pageIndex)}
        className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/85 hover:bg-white/10"
      >
        <Maximize2 className="h-4 w-4" />
        Enlarge
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
              disableFlipByClick={true}
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
                      openLightbox(index);
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
            : "Click a page to enlarge · use arrows to flip · pinch / scroll to zoom"}
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
      <div className="flex flex-wrap items-center gap-2">
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

      {!shouldLoadPdf ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 border border-dashed border-white/15 bg-[#0B0B0C]/60 px-6 py-16 text-center lg:min-h-[420px]">
          <p className="max-w-sm text-sm text-white/55">
            Choose a language, then open the menu book. The PDF loads only when you ask for it.
          </p>
          <button
            type="button"
            onClick={() => setShouldLoadPdf(true)}
            disabled={!activePdf}
            className="inline-flex items-center justify-center bg-[#8B1E2D] px-8 py-3.5 text-sm font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[#A02435] disabled:opacity-40"
          >
            Open menu
          </button>
        </div>
      ) : loading ? (
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
        <MenuPageLightbox
          pages={pages}
          pageIndex={lightboxPage}
          label={activePdf?.label}
          onClose={() => setLightboxPage(null)}
          onChangePage={goToPage}
        />
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
