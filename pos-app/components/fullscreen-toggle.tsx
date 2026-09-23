"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useApp } from "@/contexts/app-context";
import { useFullscreen } from "@/hooks/use-fullscreen";

interface FullscreenToggleProps {
  compact?: boolean;
  /** sidebar = nav button; fab = small fixed corner button on every page */
  variant?: "sidebar" | "fab";
}

const FAB_SIZE = 36;
const FAB_MARGIN = 12;
const DRAG_THRESHOLD_PX = 5;
/** Bump when default/clamp rules change so old stuck positions reset. */
const FAB_POS_KEY = "pos-fullscreen-fab-pos-v2";

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

/** Free drag anywhere in the viewport (same idea as CFD). */
function clampFabPos(pos: FabPos): FabPos {
  if (typeof window === "undefined") return pos;
  const maxX = Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN);
  const maxY = Math.max(FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN);
  return {
    x: Math.min(maxX, Math.max(FAB_MARGIN, pos.x)),
    y: Math.min(maxY, Math.max(FAB_MARGIN, pos.y)),
  };
}

/** Default top-right so it does not cover Pay / Windows taskbar on first load. */
function defaultFabPos(): FabPos {
  if (typeof window === "undefined") {
    return { x: FAB_MARGIN, y: FAB_MARGIN };
  }
  return clampFabPos({
    x: window.innerWidth - FAB_SIZE - FAB_MARGIN,
    y: FAB_MARGIN,
  });
}

function readStoredFabPos(): FabPos {
  if (typeof window === "undefined") return defaultFabPos();
  try {
    const raw = localStorage.getItem(FAB_POS_KEY);
    if (!raw) return defaultFabPos();
    const parsed = JSON.parse(raw) as Partial<FabPos>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return defaultFabPos();
    }
    return clampFabPos({ x: parsed.x, y: parsed.y });
  } catch {
    return defaultFabPos();
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
  const [dragging, setDragging] = useState(false);
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
    setPos(readStoredFabPos());
  }, [pathname]);

  useEffect(() => {
    const onResize = () => {
      setPos((prev) => (prev ? clampFabPos(prev) : prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Window-level move/up so drag stays smooth on Windows tablets even if the
  // pointer briefly leaves the small FAB hit target (same feel as CFD).
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      if (!drag.moved) {
        drag.moved = true;
        setDragging(true);
      }
      const next = clampFabPos({
        x: drag.originX + dx,
        y: drag.originY + dy,
      });
      setPos(next);
    };

    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      if (drag.moved) {
        const current = posRef.current;
        if (current) storeFabPos(current);
        return;
      }
      void toggle();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [toggle]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const current = posRef.current;
    if (!current) return;
    event.preventDefault();
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

  if (!supported) return null;
  if (variant === "fab" && hideFullscreenFabOnPath(pathname)) return null;

  const label = isFullscreen ? translate("exitFullscreen") : translate("fullscreen");

  if (variant === "fab") {
    if (!pos) return null;
    return (
      <button
        type="button"
        onPointerDown={onPointerDown}
        title={`${label} · drag to move`}
        aria-label={label}
        style={{ left: pos.x, top: pos.y, width: FAB_SIZE, height: FAB_SIZE }}
        className={`pointer-events-auto fixed z-[120] flex touch-none items-center justify-center rounded-full border border-white/25 bg-white/30 text-white/80 shadow-md backdrop-blur-[2px] transition-opacity hover:bg-white/45 hover:text-white active:bg-white/50 dark:border-white/20 dark:bg-zinc-950/40 dark:text-zinc-100/80 dark:hover:bg-zinc-950/55 ${
          dragging ? "cursor-grabbing opacity-90" : "cursor-grab"
        }`}
      >
        {isFullscreen ? (
          <Minimize2 className="h-4 w-4" strokeWidth={2} />
        ) : (
          <Maximize2 className="h-4 w-4" strokeWidth={2} />
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
