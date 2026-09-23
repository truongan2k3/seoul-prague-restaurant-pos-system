"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useApp } from "@/contexts/app-context";
import { useFullscreen } from "@/hooks/use-fullscreen";

interface FullscreenToggleProps {
  compact?: boolean;
  /** sidebar = nav button; fab = small fixed corner button on every page */
  variant?: "sidebar" | "fab";
}

const FAB_SIZE = 32;
const FAB_MARGIN = 12;
/** Keep clear of Pay / Windows taskbar / sticky footers. */
const FAB_BOTTOM_SAFE = 96;
const DRAG_THRESHOLD_PX = 6;
const FAB_POS_KEY = "pos-fullscreen-fab-pos";

type FabPos = { x: number; y: number };

/** Public marketing / guest surfaces — no fullscreen FAB. */
function hideFullscreenFabOnPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/" || pathname.startsWith("/landing")) return true;
  if (pathname === "/reservation" || pathname.startsWith("/reservation/")) return true;
  if (pathname === "/menu" || pathname.startsWith("/menu/")) return true;
  if (pathname === "/special-event" || pathname.startsWith("/special-event/")) return true;
  if (pathname.startsWith("/table/")) return true;
  return false;
}

function clampFabPos(pos: FabPos): FabPos {
  if (typeof window === "undefined") return pos;
  const maxX = Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN);
  const maxY = Math.max(
    FAB_MARGIN,
    window.innerHeight - FAB_SIZE - Math.max(FAB_MARGIN, FAB_BOTTOM_SAFE),
  );
  return {
    x: Math.min(maxX, Math.max(FAB_MARGIN, pos.x)),
    y: Math.min(maxY, Math.max(FAB_MARGIN, pos.y)),
  };
}

/** Always default top-right — never sit on Pay / message / Windows taskbar. */
function defaultFabPos(_pathname: string | null): FabPos {
  if (typeof window === "undefined") {
    return { x: FAB_MARGIN, y: FAB_MARGIN };
  }
  return clampFabPos({
    x: window.innerWidth - FAB_SIZE - FAB_MARGIN,
    y: FAB_MARGIN,
  });
}

function readStoredFabPos(pathname: string | null): FabPos {
  if (typeof window === "undefined") return defaultFabPos(pathname);
  try {
    const raw = localStorage.getItem(FAB_POS_KEY);
    if (!raw) return defaultFabPos(pathname);
    const parsed = JSON.parse(raw) as Partial<FabPos>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return defaultFabPos(pathname);
    }
    const clamped = clampFabPos({ x: parsed.x, y: parsed.y });
    // Migrate old bottom-right saves that covered the action bar.
    const bottomZone = window.innerHeight - FAB_BOTTOM_SAFE - FAB_SIZE;
    if (clamped.y >= bottomZone) {
      return defaultFabPos(pathname);
    }
    return clamped;
  } catch {
    return defaultFabPos(pathname);
  }
}

function storeFabPos(pos: FabPos) {
  try {
    localStorage.setItem(FAB_POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

export function FullscreenToggle({ compact = false, variant = "sidebar" }: FullscreenToggleProps) {
  const { translate } = useApp();
  const { isFullscreen, supported, toggle } = useFullscreen();
  const pathname = usePathname();
  const [pos, setPos] = useState<FabPos | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const posRef = useRef<FabPos | null>(null);
  posRef.current = pos;

  useEffect(() => {
    setPos(readStoredFabPos(pathname));
  }, [pathname]);

  useEffect(() => {
    const onResize = () => {
      setPos((prev) => (prev ? clampFabPos(prev) : prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const current = posRef.current;
    if (!current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: current.x,
      originY: current.y,
      moved: false,
    };
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const next = clampFabPos({
      x: drag.originX + dx,
      y: drag.originY + dy,
    });
    setPos(next);
  }, []);

  const endPointer = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      if (drag.moved) {
        const current = posRef.current;
        if (current) storeFabPos(current);
        return;
      }
      void toggle();
    },
    [toggle],
  );

  if (!supported) return null;
  if (variant === "fab" && hideFullscreenFabOnPath(pathname)) return null;

  const label = isFullscreen ? translate("exitFullscreen") : translate("fullscreen");

  if (variant === "fab") {
    if (!pos) return null;
    return (
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        title={`${label} · drag to move`}
        aria-label={label}
        style={{ left: pos.x, top: pos.y, width: FAB_SIZE, height: FAB_SIZE }}
        className="pointer-events-auto fixed z-[120] flex touch-none items-center justify-center rounded-full border border-white/25 bg-white/25 text-white/70 shadow-none backdrop-blur-[2px] transition-opacity hover:bg-white/40 hover:text-white active:bg-white/45 dark:border-white/20 dark:bg-zinc-950/30 dark:text-zinc-200/70 dark:hover:bg-zinc-950/45"
      >
        {isFullscreen ? (
          <Minimize2 className="h-3.5 w-3.5" strokeWidth={2} />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      title={label}
      aria-label={label}
      className={`flex min-h-[44px] w-full items-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 ${
        compact ? "justify-center px-2 py-2" : "gap-2 px-3 py-2"
      }`}
    >
      {isFullscreen ? (
        <Minimize2 className="h-4 w-4 shrink-0" />
      ) : (
        <Maximize2 className="h-4 w-4 shrink-0" />
      )}
      {!compact && <span>{label}</span>}
    </button>
  );
}
