"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Calculator } from "lucide-react";
import { DraggableNumericKeyboard } from "@/components/draggable-numeric-keyboard";
import { OnScreenNumericKeyboard } from "@/components/on-screen-numeric-keyboard";
import { useApp } from "@/contexts/app-context";

const NUMERIC_KEYBOARD_OPEN_EVENT = "pos:numeric-keyboard-open";

export interface NumericInputFieldHandle {
  focus: () => void;
  openKeyboard: () => void;
  closeKeyboard: () => void;
}

interface NumericInputFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  allowDecimal?: boolean;
  previewLabel?: string;
  id?: string;
  /** Render keyboard in a fixed dock (e.g. above checkout footer) instead of inline */
  keyboardPortalTargetId?: string;
  /** Floating draggable keyboard popup (default position: right side) */
  floatingKeyboard?: boolean;
  /** Hide the calculator toggle button on the input row */
  hideKeyboardToggle?: boolean;
  /** Open keyboard when the input receives focus */
  openOnFocus?: boolean;
}

export const NumericInputField = forwardRef<NumericInputFieldHandle, NumericInputFieldProps>(
  function NumericInputField(
    {
      value,
      onChange,
      placeholder,
      className = "",
      inputClassName = "pos-input",
      allowDecimal = true,
      previewLabel,
      id,
      keyboardPortalTargetId,
      floatingKeyboard = false,
      hideKeyboardToggle = false,
      openOnFocus = false,
    },
    ref,
  ) {
    const { translate } = useApp();
    const autoId = useId();
    const inputId = id ?? autoId;
    const inputRef = useRef<HTMLInputElement>(null);
    const fieldRef = useRef<HTMLDivElement>(null);
    const keyboardPanelRef = useRef<HTMLDivElement>(null);
    const [keyboardOpen, setKeyboardOpen] = useState(false);

    useEffect(() => {
      const handleOtherOpen = (event: Event) => {
        const detail = (event as CustomEvent<string>).detail;
        if (detail !== inputId) {
          setKeyboardOpen(false);
        }
      };
      window.addEventListener(NUMERIC_KEYBOARD_OPEN_EVENT, handleOtherOpen);
      return () => window.removeEventListener(NUMERIC_KEYBOARD_OPEN_EVENT, handleOtherOpen);
    }, [inputId]);

    useEffect(() => {
      if (!keyboardOpen || !keyboardPortalTargetId || floatingKeyboard) return;
      document.getElementById(inputId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [keyboardOpen, keyboardPortalTargetId, inputId, floatingKeyboard]);

    useEffect(() => {
      if (!keyboardOpen || !floatingKeyboard) return;

      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target as Node;
        if (fieldRef.current?.contains(target)) return;
        if (keyboardPanelRef.current?.contains(target)) return;
        setKeyboardOpen(false);
        if (document.activeElement === inputRef.current) {
          inputRef.current?.blur();
        }
      };

      document.addEventListener("pointerdown", handlePointerDown, true);
      return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [keyboardOpen, floatingKeyboard]);

    const openKeyboard = () => {
      setKeyboardOpen(true);
      window.dispatchEvent(new CustomEvent(NUMERIC_KEYBOARD_OPEN_EVENT, { detail: inputId }));
    };

    const closeKeyboard = () => setKeyboardOpen(false);

    const toggleKeyboard = () => {
      setKeyboardOpen((open) => {
        const next = !open;
        if (next) {
          window.dispatchEvent(new CustomEvent(NUMERIC_KEYBOARD_OPEN_EVENT, { detail: inputId }));
        }
        return next;
      });
    };

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      openKeyboard,
      closeKeyboard,
    }));

    const sanitize = (raw: string) => {
      let next = raw.replace(/[^\d.]/g, "");
      if (!allowDecimal) {
        return next.replace(/\./g, "");
      }
      const dotIndex = next.indexOf(".");
      if (dotIndex >= 0) {
        next = `${next.slice(0, dotIndex + 1)}${next.slice(dotIndex + 1).replace(/\./g, "")}`;
      }
      return next;
    };

    const keyboardNode = (
      <OnScreenNumericKeyboard
        value={value}
        onChange={(next) => onChange(sanitize(next))}
        onHide={closeKeyboard}
        allowDecimal={allowDecimal}
        previewLabel={previewLabel}
      />
    );

    return (
      <div className={className} ref={fieldRef}>
        <div className="flex items-stretch gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(sanitize(event.target.value))}
            onFocus={() => {
              if (openOnFocus || floatingKeyboard) {
                openKeyboard();
              }
            }}
            onBlur={() => {
              if (!floatingKeyboard && !openOnFocus) return;
              window.requestAnimationFrame(() => {
                const active = document.activeElement;
                if (active === inputRef.current) return;
                if (keyboardPanelRef.current?.contains(active)) return;
                setKeyboardOpen(false);
              });
            }}
            className={`min-w-0 flex-1 ${inputClassName}`}
          />
          {!hideKeyboardToggle && (
            <button
              type="button"
              onClick={toggleKeyboard}
              aria-label={keyboardOpen ? translate("hideKeyboard") : translate("showNumericKeyboard")}
              aria-pressed={keyboardOpen}
              className={`inline-flex shrink-0 items-center justify-center rounded-lg border px-3 transition-colors ${
                keyboardOpen
                  ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                  : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              <Calculator className="h-4 w-4" />
            </button>
          )}
        </div>
        {keyboardOpen &&
          (() => {
            if (floatingKeyboard && typeof document !== "undefined") {
              return (
                <DraggableNumericKeyboard
                  ref={keyboardPanelRef}
                  value={value}
                  onChange={(next) => onChange(sanitize(next))}
                  onHide={closeKeyboard}
                  allowDecimal={allowDecimal}
                  previewLabel={previewLabel}
                />
              );
            }

            if (keyboardPortalTargetId && typeof document !== "undefined") {
              const target = document.getElementById(keyboardPortalTargetId);
              if (target) {
                return createPortal(keyboardNode, target);
              }
            }

            return keyboardNode;
          })()}
      </div>
    );
  },
);
