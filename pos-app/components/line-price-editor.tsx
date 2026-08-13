"use client";

import { useState } from "react";
import { PercentPresetButtons } from "@/components/percent-preset-buttons";
import { NumericInputField } from "@/components/numeric-input-field";
import type { EditableLine } from "@/lib/editable-order-lines";
import {
  inferPercentDiscount,
  isLinePriceAdjusted,
  resolveOriginalUnitPrice,
  type LinePriceAdjustMode,
} from "@/lib/order-line-pricing";
import { filterButtonClass } from "@/lib/theme-classes";
import type { MenuItem } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/translations";

interface LinePriceEditorProps {
  line: EditableLine;
  menuItems: MenuItem[];
  translate: (key: TranslationKey) => string;
  formatOrderPrice: (amount: number) => string;
  onApply: (mode: LinePriceAdjustMode, value: number) => void;
  onReset: () => void;
  onCancel: () => void;
}

export function LinePriceEditor({
  line,
  menuItems,
  translate,
  formatOrderPrice,
  onApply,
  onReset,
  onCancel,
}: LinePriceEditorProps) {
  const originalPrice = resolveOriginalUnitPrice(line, menuItems);
  const adjusted = isLinePriceAdjusted(line, menuItems);
  const [mode, setMode] = useState<LinePriceAdjustMode>(adjusted ? "custom" : "percent");
  const [value, setValue] = useState(() => {
    if (!adjusted) return "";
    return String(
      adjusted && inferPercentDiscount(originalPrice, line.price) > 0
        ? inferPercentDiscount(originalPrice, line.price)
        : line.price,
    );
  });
  const [percentPreset, setPercentPreset] = useState<number | null>(() => {
    if (!adjusted || mode !== "percent") return null;
    const pct = inferPercentDiscount(originalPrice, line.price);
    return pct > 0 ? pct : null;
  });

  const previewPrice =
    mode === "percent"
      ? originalPrice * (1 - Math.min(100, Math.max(0, Number(value) || 0)) / 100)
      : Math.max(0, Number(value) || 0);

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900 dark:bg-amber-950/30">
      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
        {translate("editPrice")} — {line.name}
      </p>
      <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
        {translate("lineOriginalPrice")}: {formatOrderPrice(originalPrice)}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("percent")}
          className={filterButtonClass(mode === "percent")}
        >
          {translate("priceAdjustPercent")}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("custom");
            setPercentPreset(null);
          }}
          className={filterButtonClass(mode === "custom")}
        >
          {translate("priceAdjustCustom")}
        </button>
      </div>

      <label className="mt-3 block text-xs">
        <span className="text-gray-600 dark:text-gray-300">
          {mode === "percent" ? translate("priceAdjustPercent") : translate("priceAdjustCustom")}
        </span>
        {mode === "percent" && (
          <div className="mt-2">
            <PercentPresetButtons
              selected={percentPreset}
              onSelect={(pct) => {
                setPercentPreset(pct);
                setValue(String(pct));
              }}
              activeClassName="bg-amber-600 text-white"
              inactiveClassName="bg-white text-amber-900 dark:bg-gray-900 dark:text-amber-200"
            />
          </div>
        )}
        <NumericInputField
          value={value}
          onChange={(next) => {
            setValue(next);
            setPercentPreset(null);
          }}
          allowDecimal={mode !== "percent"}
          placeholder={mode === "percent" ? "10" : String(originalPrice)}
          className="mt-2"
        />
      </label>

      <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
        {translate("lineNewPrice")}:{" "}
        <span className="font-semibold tabular-nums">{formatOrderPrice(previewPrice)}</span>
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onApply(mode, Number(value))}
          disabled={value === "" || Number.isNaN(Number(value))}
          className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {translate("applyPrice")}
        </button>
        {adjusted && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:text-amber-200"
          >
            {translate("resetPrice")}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-gray-700"
        >
          {translate("cancel")}
        </button>
      </div>
    </div>
  );
}
