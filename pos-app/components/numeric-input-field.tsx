"use client";

import { useId, useState } from "react";
import { Calculator } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { OnScreenNumericKeyboard } from "@/components/on-screen-numeric-keyboard";

interface NumericInputFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  allowDecimal?: boolean;
  previewLabel?: string;
  id?: string;
}

export function NumericInputField({
  value,
  onChange,
  placeholder,
  className = "",
  inputClassName = "pos-input",
  allowDecimal = true,
  previewLabel,
  id,
}: NumericInputFieldProps) {
  const { translate } = useApp();
  const autoId = useId();
  const inputId = id ?? autoId;
  const [keyboardOpen, setKeyboardOpen] = useState(false);

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

  return (
    <div className={className}>
      <div className="flex items-stretch gap-2">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(sanitize(event.target.value))}
          className={`min-w-0 flex-1 ${inputClassName}`}
        />
        <button
          type="button"
          onClick={() => setKeyboardOpen((open) => !open)}
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
      </div>
      {keyboardOpen && (
        <OnScreenNumericKeyboard
          value={value}
          onChange={(next) => onChange(sanitize(next))}
          onHide={() => setKeyboardOpen(false)}
          allowDecimal={allowDecimal}
          previewLabel={previewLabel}
        />
      )}
    </div>
  );
}
