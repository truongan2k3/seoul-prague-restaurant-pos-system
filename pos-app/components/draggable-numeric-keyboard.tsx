"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripHorizontal } from "lucide-react";
import { OnScreenNumericKeyboard } from "@/components/on-screen-numeric-keyboard";

interface DraggableNumericKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onHide: () => void;
  allowDecimal?: boolean;
  previewLabel?: string;
}

export type DraggableNumericKeyboardHandle = HTMLDivElement;

const PANEL_WIDTH = 288;
const VIEWPORT_MARGIN = 16;

function defaultPosition(panelHeight: number) {
  if (typeof window === "undefined") {
    return { x: VIEWPORT_MARGIN, y: VIEWPORT_MARGIN };
  }
  return {
    x: Math.max(VIEWPORT_MARGIN, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN),
    y: Math.max(VIEWPORT_MARGIN, (window.innerHeight - panelHeight) / 2),
  };
}

export const DraggableNumericKeyboard = forwardRef<
  DraggableNumericKeyboardHandle,
  DraggableNumericKeyboardProps
>(function DraggableNumericKeyboard(
  {
    value,
    onChange,
    onHide,
    allowDecimal = true,
    previewLabel,
  },
  ref,
) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const height = panel?.offsetHeight ?? 340;
    setPos(defaultPosition(height));
  }, []);

  const clampPosition = useCallback((x: number, y: number) => {
    if (typeof window === "undefined") return { x, y };
    const panel = panelRef.current;
    const width = panel?.offsetWidth ?? PANEL_WIDTH;
    const height = panel?.offsetHeight ?? 340;
    return {
      x: Math.min(Math.max(VIEWPORT_MARGIN, x), window.innerWidth - width - VIEWPORT_MARGIN),
      y: Math.min(Math.max(VIEWPORT_MARGIN, y), window.innerHeight - height - VIEWPORT_MARGIN),
    };
  }, []);

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pos) return;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: pos.x,
      origY: pos.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = clampPosition(
      drag.origX + (event.clientX - drag.startX),
      drag.origY + (event.clientY - drag.startY),
    );
    setPos(next);
  };

  const handleDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (typeof document === "undefined") return null;

  const setPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  return createPortal(
    <div
      ref={setPanelRef}
      className="fixed z-[120] w-[min(calc(100vw-2rem),18rem)] rounded-xl border border-gray-300 bg-white shadow-2xl dark:border-gray-600 dark:bg-gray-900"
      style={{
        left: pos?.x ?? -9999,
        top: pos?.y ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      role="dialog"
      aria-label="Numeric keyboard"
      onPointerDown={(event) => event.preventDefault()}
    >
      <div
        className="flex cursor-grab items-center justify-center border-b border-gray-200 bg-gray-50 py-1.5 active:cursor-grabbing dark:border-gray-700 dark:bg-gray-800"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <GripHorizontal className="h-5 w-5 text-gray-400" aria-hidden />
      </div>
      <div className="p-1">
        <OnScreenNumericKeyboard
          value={value}
          onChange={onChange}
          onHide={onHide}
          allowDecimal={allowDecimal}
          previewLabel={previewLabel}
        />
      </div>
    </div>,
    document.body,
  );
});
