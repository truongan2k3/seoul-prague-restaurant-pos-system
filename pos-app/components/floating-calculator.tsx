"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripHorizontal, X } from "lucide-react";
import { useApp } from "@/contexts/app-context";

const PANEL_WIDTH = 260;
const VIEWPORT_MARGIN = 16;

function defaultPosition(panelHeight: number) {
  if (typeof window === "undefined") {
    return { x: VIEWPORT_MARGIN, y: VIEWPORT_MARGIN };
  }
  return {
    x: Math.max(VIEWPORT_MARGIN, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN),
    y: Math.max(VIEWPORT_MARGIN, window.innerHeight - panelHeight - VIEWPORT_MARGIN),
  };
}

function formatDisplay(value: number): string {
  if (!Number.isFinite(value)) return "Error";
  const rounded = Math.round(value * 1e10) / 1e10;
  return String(rounded);
}

function compute(left: number, right: number, op: string): number {
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? Number.NaN : left / right;
    default:
      return right;
  }
}

interface FloatingCalculatorProps {
  open: boolean;
  onClose: () => void;
}

export function FloatingCalculator({ open, onClose }: FloatingCalculatorProps) {
  const { translate } = useApp();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (!open) return;
    const height = panelRef.current?.offsetHeight ?? 360;
    setPos(defaultPosition(height));
    setDisplay("0");
    setStored(null);
    setOperator(null);
    setFresh(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open, onClose]);

  const clampPosition = useCallback((x: number, y: number) => {
    if (typeof window === "undefined") return { x, y };
    const panel = panelRef.current;
    const width = panel?.offsetWidth ?? PANEL_WIDTH;
    const height = panel?.offsetHeight ?? 360;
    return {
      x: Math.min(Math.max(VIEWPORT_MARGIN, x), window.innerWidth - width - VIEWPORT_MARGIN),
      y: Math.min(Math.max(VIEWPORT_MARGIN, y), window.innerHeight - height - VIEWPORT_MARGIN),
    };
  }, []);

  const currentValue = () => Number(display);

  const applyDigit = (digit: string) => {
    setDisplay((prev) => {
      if (fresh || prev === "0") return digit === "." ? "0." : digit;
      if (digit === "." && prev.includes(".")) return prev;
      return `${prev}${digit}`;
    });
    setFresh(false);
  };

  const applyOperator = (nextOp: string) => {
    const value = currentValue();
    if (stored != null && operator && !fresh) {
      const result = compute(stored, value, operator);
      setDisplay(formatDisplay(result));
      setStored(result);
    } else {
      setStored(value);
    }
    setOperator(nextOp);
    setFresh(true);
  };

  const applyEquals = () => {
    if (stored == null || !operator) return;
    const result = compute(stored, currentValue(), operator);
    setDisplay(formatDisplay(result));
    setStored(null);
    setOperator(null);
    setFresh(true);
  };

  const clearAll = () => {
    setDisplay("0");
    setStored(null);
    setOperator(null);
    setFresh(false);
  };

  const backspace = () => {
    setDisplay((prev) => {
      if (fresh || prev.length <= 1) return "0";
      const next = prev.slice(0, -1);
      return next === "" || next === "-" ? "0" : next;
    });
    setFresh(false);
  };

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
    setPos(
      clampPosition(
        drag.origX + (event.clientX - drag.startX),
        drag.origY + (event.clientY - drag.startY),
      ),
    );
  };

  const handleDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const keyClass =
    "min-h-[44px] rounded-lg border border-gray-300 bg-white text-lg font-semibold tabular-nums text-gray-900 active:bg-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700";
  const opClass =
    "min-h-[44px] rounded-lg border border-blue-300 bg-blue-50 text-lg font-semibold text-blue-800 active:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200 dark:active:bg-blue-900/60";

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[120] w-[min(calc(100vw-2rem),16.25rem)] rounded-xl border border-gray-300 bg-white shadow-2xl dark:border-gray-600 dark:bg-gray-900"
      style={{
        left: pos?.x ?? -9999,
        top: pos?.y ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      role="dialog"
      aria-label={translate("calculator")}
      onPointerDown={(event) => event.preventDefault()}
    >
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800">
        <div
          className="flex flex-1 cursor-grab items-center justify-center active:cursor-grabbing"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <GripHorizontal className="h-5 w-5 text-gray-400" aria-hidden />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
          aria-label={translate("close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-2">
        <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-right text-2xl font-bold tabular-nums text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100">
          {display}
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          <button type="button" className={keyClass} onClick={clearAll}>
            C
          </button>
          <button type="button" className={keyClass} onClick={backspace}>
            ⌫
          </button>
          <button type="button" className={opClass} onClick={() => applyOperator("/")}>
            ÷
          </button>
          <button type="button" className={opClass} onClick={() => applyOperator("*")}>
            ×
          </button>

          {(["7", "8", "9"] as const).map((digit) => (
            <button key={digit} type="button" className={keyClass} onClick={() => applyDigit(digit)}>
              {digit}
            </button>
          ))}
          <button type="button" className={opClass} onClick={() => applyOperator("-")}>
            −
          </button>

          {(["4", "5", "6"] as const).map((digit) => (
            <button key={digit} type="button" className={keyClass} onClick={() => applyDigit(digit)}>
              {digit}
            </button>
          ))}
          <button type="button" className={opClass} onClick={() => applyOperator("+")}>
            +
          </button>

          {(["1", "2", "3"] as const).map((digit) => (
            <button key={digit} type="button" className={keyClass} onClick={() => applyDigit(digit)}>
              {digit}
            </button>
          ))}
          <button type="button" className={`${opClass} row-span-2 min-h-[92px]`} onClick={applyEquals}>
            =
          </button>

          <button type="button" className={`${keyClass} col-span-2`} onClick={() => applyDigit("0")}>
            0
          </button>
          <button type="button" className={keyClass} onClick={() => applyDigit(".")}>
            .
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
