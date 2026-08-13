"use client";

import { MessageSquare, Minus, Plus, Tag, Trash2 } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/translations";

interface OrderLineToolbarProps {
  translate: (key: TranslationKey) => string;
  qtyEditable: boolean;
  priceEditable: boolean;
  onSpecialRequest: () => void;
  onEditPrice: () => void;
  onIncrease: () => void;
  onDecrease: () => void;
  onDelete: () => void;
  disabled?: boolean;
  priceActive?: boolean;
  /** Vertical sidebar (default) or compact horizontal row under selected line */
  layout?: "sidebar" | "inline";
  onDismiss?: () => void;
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  active,
  variant = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  variant?: "default" | "plus" | "minus" | "danger";
  children: React.ReactNode;
}) {
  const variantClass =
    variant === "plus"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : variant === "minus"
        ? "bg-emerald-600 text-white hover:bg-emerald-700"
        : variant === "danger"
          ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
          : active
            ? "border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-600 dark:bg-blue-950/40 dark:text-blue-200"
            : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center disabled:opacity-40 ${variantClass}`}
    >
      <span className="flex h-8 w-8 items-center justify-center">{children}</span>
      <span className="text-[10px] font-semibold leading-tight">{label}</span>
    </button>
  );
}

export function OrderLineToolbar({
  translate,
  qtyEditable,
  priceEditable,
  onSpecialRequest,
  onEditPrice,
  onIncrease,
  onDecrease,
  onDelete,
  disabled = false,
  priceActive = false,
  layout = "sidebar",
  onDismiss,
}: OrderLineToolbarProps) {
  if (layout === "inline") {
    const btnClass =
      "inline-flex h-9 min-w-[2.25rem] items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold disabled:opacity-40";
    return (
      <div className="flex flex-wrap items-center gap-1.5 border-t border-blue-100 bg-blue-50/80 px-2 py-2 dark:border-blue-900 dark:bg-blue-950/30">
        <button
          type="button"
          disabled={disabled || !qtyEditable}
          onClick={onSpecialRequest}
          className={`${btnClass} border-gray-200 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100`}
        >
          <MessageSquare className="h-4 w-4" />
          <span className="hidden sm:inline">{translate("specialRequests")}</span>
        </button>
        <button
          type="button"
          disabled={disabled || !priceEditable}
          onClick={onEditPrice}
          className={`${btnClass} ${
            priceActive
              ? "border-blue-500 bg-blue-100 text-blue-800 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-200"
              : "border-gray-200 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          }`}
        >
          <Tag className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={disabled || !qtyEditable}
          onClick={onIncrease}
          className={`${btnClass} border-blue-600 bg-blue-600 text-white`}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={disabled || !qtyEditable}
          onClick={onDecrease}
          className={`${btnClass} border-emerald-600 bg-emerald-600 text-white`}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={disabled || !qtyEditable}
          onClick={onDelete}
          className={`${btnClass} border-red-200 text-red-600 dark:border-red-900`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className={`${btnClass} ml-auto border-gray-200 text-gray-500 dark:border-gray-600 dark:text-gray-400`}
          >
            ✕
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-[4.75rem] shrink-0 flex-col gap-1.5">
      <ToolbarButton
        label={translate("specialRequests")}
        onClick={onSpecialRequest}
        disabled={disabled || !qtyEditable}
      >
        <MessageSquare className="h-5 w-5" />
      </ToolbarButton>
      <ToolbarButton
        label={translate("editPrice")}
        onClick={onEditPrice}
        disabled={disabled || !priceEditable}
        active={priceActive}
      >
        <Tag className="h-5 w-5" />
      </ToolbarButton>
      <ToolbarButton
        label="+"
        onClick={onIncrease}
        disabled={disabled || !qtyEditable}
        variant="plus"
      >
        <Plus className="h-5 w-5" />
      </ToolbarButton>
      <ToolbarButton
        label="−"
        onClick={onDecrease}
        disabled={disabled || !qtyEditable}
        variant="minus"
      >
        <Minus className="h-5 w-5" />
      </ToolbarButton>
      <ToolbarButton
        label={translate("deleteItem")}
        onClick={onDelete}
        disabled={disabled || !qtyEditable}
        variant="danger"
      >
        <Trash2 className="h-5 w-5" />
      </ToolbarButton>
    </div>
  );
}
