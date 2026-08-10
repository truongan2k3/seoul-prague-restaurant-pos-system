"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import {
  buildLineDisplayName,
  computeCustomizedPrice,
  getDefaultSelections,
  optionLabel,
  resolveSelectedOptions,
} from "@/lib/menu-customization";
import { formatPosPrice, priceDisplayOptionsFromSettings } from "@/lib/price-display";
import { menuItemDisplayName } from "@/lib/menu-display";
import type { MenuItem, SelectedMenuOption } from "@/lib/types";

export interface CustomizeResult {
  selectedOptions: SelectedMenuOption[];
  selections: Record<string, string>;
  freeAddOnSelected: boolean;
  price: number;
  displayName: string;
  kitchenModifierText: string;
  itemNote: string;
}

interface ItemCustomizeModalProps {
  open: boolean;
  item: MenuItem;
  onClose: () => void;
  onConfirm: (result: CustomizeResult) => void;
}

export function ItemCustomizeModal({ open, item, onClose, onConfirm }: ItemCustomizeModalProps) {
  const { translate, language } = useApp();
  const { settings } = useSettings();
  const priceOptions = priceDisplayOptionsFromSettings(settings);
  const formatOrderPrice = (amount: number) => formatPosPrice(amount, priceOptions);
  const config = item.customizationConfig;

  const [selections, setSelections] = useState<Record<string, string>>({});
  const [freeAddOnSelected, setFreeAddOnSelected] = useState(false);
  const [itemNote, setItemNote] = useState("");

  useEffect(() => {
    if (!open || !config) return;
    setSelections(getDefaultSelections(config, item));
    setFreeAddOnSelected(false);
    setItemNote("");
  }, [open, item, config]);

  const selectedOptions = useMemo(
    () => (config ? resolveSelectedOptions(config, selections) : []),
    [config, selections],
  );

  const price = useMemo(
    () => computeCustomizedPrice(item, selectedOptions),
    [item, selectedOptions],
  );

  const baseName = menuItemDisplayName(item, language);
  const displayName = buildLineDisplayName(
    baseName,
    selectedOptions,
    language,
    freeAddOnSelected,
    config?.freeAddOn,
  );

  const kitchenModifierText = selectedOptions
    .map((entry) => entry.nameZh.trim() || entry.nameEn)
    .concat(
      freeAddOnSelected && config?.freeAddOn
        ? [config.freeAddOn.nameZh.trim() || config.freeAddOn.nameEn]
        : [],
    )
    .join(" · ");

  const canConfirm = useMemo(() => {
    if (!config?.optionGroups?.length) return true;
    return config.optionGroups.every((group) => {
      if (!group.required) return true;
      return Boolean(selections[group.id]);
    });
  }, [config, selections]);

  if (!open || !config) return null;

  const handleConfirm = () => {
    onConfirm({
      selectedOptions,
      selections,
      freeAddOnSelected,
      price,
      displayName,
      kitchenModifierText,
      itemNote: itemNote.trim(),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={baseName}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold dark:border-gray-700"
          >
            {translate("cancel")}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {translate("addToCart")} · {formatOrderPrice(price)}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {(config.optionGroups ?? []).map((group) => (
          <section key={group.id}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {language === "cs"
                ? group.nameCz
                : language === "zh"
                  ? group.nameZh ?? group.nameEn
                  : group.nameEn}
              {group.required ? " *" : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => {
                const active = selections[group.id] === option.id;
                const sideDelta =
                  group.id === "protein"
                    ? 0
                    : 0;
                const optionPrice =
                  config.basePriceFromOptions && option.price != null
                    ? option.price +
                      (group.id === "protein"
                        ? selectedOptions
                            .filter((entry) => entry.groupId === "side")
                            .reduce((sum, entry) => sum + (entry.priceDelta ?? 0), 0)
                        : sideDelta)
                    : null;
                const deltaLabel =
                  option.priceDelta && option.priceDelta > 0
                    ? `+${formatOrderPrice(option.priceDelta)}`
                    : null;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() =>
                      setSelections((prev) => ({ ...prev, [group.id]: option.id }))
                    }
                    className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition ${
                      active
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    }`}
                  >
                    <span>{optionLabel(option, language)}</span>
                    {optionPrice != null ? (
                      <span className="mt-0.5 block text-xs tabular-nums opacity-80">
                        {formatOrderPrice(optionPrice)}
                      </span>
                    ) : deltaLabel ? (
                      <span className="mt-0.5 block text-xs tabular-nums opacity-80">{deltaLabel}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {config.freeAddOn && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30">
            <input
              type="checkbox"
              checked={freeAddOnSelected}
              onChange={(event) => setFreeAddOnSelected(event.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300"
            />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {optionLabel(config.freeAddOn, language)}
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                {translate("freeAddOnHint")}
              </p>
            </div>
          </label>
        )}

        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {translate("itemNoteOptional")}
          </span>
          <textarea
            rows={2}
            value={itemNote}
            onChange={(event) => setItemNote(event.target.value)}
            className="mt-2 w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-base dark:border-gray-700 dark:bg-gray-800"
          />
        </label>

        <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-gray-900">
          <p className="font-semibold text-gray-900 dark:text-gray-100">{displayName}</p>
          <p className="mt-1 text-emerald-600 dark:text-emerald-400">{formatOrderPrice(price)}</p>
        </div>
      </div>
    </Modal>
  );
}
