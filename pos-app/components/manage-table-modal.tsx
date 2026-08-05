"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Minus, Percent, Plus, Save, ShoppingBag, Tag, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { NumericInputField } from "@/components/numeric-input-field";
import { PercentPresetButtons } from "@/components/percent-preset-buttons";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import { useSettings } from "@/contexts/settings-context";
import {
  inferPercentDiscount,
  isLinePriceAdjusted,
  resolveOriginalUnitPrice,
  withAdjustedLinePrice,
  withResetLinePrice,
  type LinePriceAdjustMode,
} from "@/lib/order-line-pricing";
import { orderItemDisplayName } from "@/lib/menu-display";
import {
  normalizeOrderItemStatus,
  rowSurfaceClass,
  statusTranslationKey,
} from "@/lib/order-status";
import {
  isManageTableLineEditable,
  isManageTablePriceEditable,
} from "@/lib/order-sla";
import { formatPosPrice, priceDisplayOptionsFromSettings } from "@/lib/price-display";
import { filterButtonClass } from "@/lib/theme-classes";
import type { MenuItem, OrderItem, RestaurantTable } from "@/lib/types";
import { markItemsServed } from "@/src/lib/table-actions";

type EditableLine = OrderItem & { lineId: string };

interface ManageTableModalProps {
  open: boolean;
  table: RestaurantTable;
  allTables: RestaurantTable[];
  menuItems: MenuItem[];
  orderItems: OrderItem[];
  onClose: () => void;
  onSaveOrders: (orders: OrderItem[]) => void | Promise<void>;
  onTransfer: (toTableId: string) => void | Promise<void>;
  onProceedToCheckout: (orders: OrderItem[]) => void | Promise<void>;
  onAddItems: () => void;
  onRefresh: () => void;
  isSaving?: boolean;
  error?: string | null;
}

function toEditableLines(
  orderItems: OrderItem[],
  fallbackOrders: OrderItem[],
  menuItems: MenuItem[],
): EditableLine[] {
  const source = orderItems.length > 0 ? orderItems : fallbackOrders;

  return source.map((item, index) => {
    const originalPrice = resolveOriginalUnitPrice(item, menuItems);
    return {
      ...item,
      originalPrice,
      price: item.price,
      lineId: item.id
        ? `${item.id}::${index}`
        : `line-${index}-${item.menuItemId ?? "x"}-${item.name}-${item.notes ?? ""}-${item.price}-${item.station ?? ""}`,
    };
  });
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-950/40">
      <h3 className="border-b border-gray-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
        {title}
      </h3>
      <div className="p-4">{children}</div>
    </section>
  );
}

function LinePriceEditor({
  line,
  menuItems,
  translate,
  formatOrderPrice,
  onApply,
  onReset,
  onCancel,
}: {
  line: EditableLine;
  menuItems: MenuItem[];
  translate: ReturnType<typeof useApp>["translate"];
  formatOrderPrice: (amount: number) => string;
  onApply: (mode: LinePriceAdjustMode, value: number) => void;
  onReset: () => void;
  onCancel: () => void;
}) {
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

export function ManageTableModal({
  open,
  table,
  allTables,
  menuItems,
  orderItems,
  onClose,
  onSaveOrders,
  onTransfer,
  onProceedToCheckout,
  onAddItems,
  onRefresh,
  isSaving = false,
  error,
}: ManageTableModalProps) {
  const { translate, language, currentStaffUser } = useApp();
  const { requestPin } = usePinGate();
  const { settings } = useSettings();
  const priceOptions = priceDisplayOptionsFromSettings(settings);
  const formatOrderPrice = (amount: number) => formatPosPrice(amount, priceOptions);

  const [lines, setLines] = useState<EditableLine[]>([]);
  const [transferTo, setTransferTo] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [servingId, setServingId] = useState<string | null>(null);
  const [priceEditLineId, setPriceEditLineId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLines(toEditableLines(orderItems, table.orders ?? [], menuItems));
    setTransferTo("");
    setShowTransfer(false);
    setLocalError(null);
    setServingId(null);
    setPriceEditLineId(null);
  }, [open, table, orderItems, menuItems]);

  const emptyTables = allTables.filter((t) => t.status === "empty" && t.id !== table.id);

  const subtotal = useMemo(
    () => lines.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [lines],
  );

  const ordersPayload = useMemo(
    () => lines.filter((item) => item.quantity > 0).map(({ lineId: _lineId, ...item }) => item),
    [lines],
  );

  const adjustQuantity = (lineId: string, delta: number) => {
    setPriceEditLineId(null);
    setLines((prev) =>
      prev
        .map((line) =>
          line.lineId === lineId ? { ...line, quantity: line.quantity + delta } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const removeLine = (lineId: string) => {
    setPriceEditLineId(null);
    setLines((prev) => prev.filter((line) => line.lineId !== lineId));
  };

  const openPriceEditor = (line: EditableLine) => {
    requestPin(() => {
      setPriceEditLineId((current) => (current === line.lineId ? null : line.lineId));
    });
  };

  const applyPriceEdit = (lineId: string, mode: LinePriceAdjustMode, value: number) => {
    setLines((prev) =>
      prev.map((line) =>
        line.lineId === lineId ? { ...line, ...withAdjustedLinePrice(line, menuItems, mode, value) } : line,
      ),
    );
    setPriceEditLineId(null);
  };

  const resetLinePrice = (lineId: string) => {
    setLines((prev) =>
      prev.map((line) =>
        line.lineId === lineId ? { ...line, ...withResetLinePrice(line, menuItems) } : line,
      ),
    );
    setPriceEditLineId(null);
  };

  const markServed = async (line: EditableLine) => {
    if (!line.id || servingId) return;
    setServingId(line.id);
    setLocalError(null);
    const actor = currentStaffUser?.name ?? "Staff";
    const { error: updateError } = await markItemsServed([line.id], actor, table.id);
    setServingId(null);
    if (updateError) {
      setLocalError(updateError.message);
      return;
    }
    setLines((prev) =>
      prev.map((row) =>
        row.lineId === line.lineId ? { ...row, status: "served" as const } : row,
      ),
    );
    onRefresh();
  };

  const handleSave = async () => {
    setLocalError(null);
    await onSaveOrders(ordersPayload);
  };

  const handleTransfer = async () => {
    if (!transferTo) return;
    setLocalError(null);
    if (ordersPayload.length > 0) {
      await onSaveOrders(ordersPayload);
    }
    await onTransfer(transferTo);
  };

  const handleProceedToCheckout = async () => {
    setLocalError(null);
    if (ordersPayload.length === 0) {
      setLocalError(translate("nothingToCheckout"));
      return;
    }
    await onProceedToCheckout(ordersPayload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${translate("manageTable")} — ${translate("table")} ${table.label}`}
    >
      <div className="space-y-4">
        {(error || localError) && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error ?? localError}
          </p>
        )}

        <Section title={translate("currentOrder")}>
          {lines.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{translate("noOrders")}</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((line) => {
                const displayName = orderItemDisplayName(line, menuItems, language);
                const status = normalizeOrderItemStatus(line.status);
                const qtyEditable = isManageTableLineEditable(line.status);
                const priceEditable = isManageTablePriceEditable(line.status);
                const isReady = status === "ready";
                const isServed = status === "served";
                const originalPrice = resolveOriginalUnitPrice(line, menuItems);
                const priceChanged = isLinePriceAdjusted(line, menuItems);

                return (
                  <li
                    key={line.lineId}
                    className={`rounded-lg border px-3 py-2.5 ${
                      isServed
                        ? "border-slate-300 bg-slate-50 opacity-90 dark:border-slate-600 dark:bg-slate-900/60"
                        : isReady
                          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                          : `border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 ${rowSurfaceClass(status)}`
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-medium ${
                            isServed
                              ? "text-slate-700 dark:text-slate-200"
                              : isReady
                                ? "text-emerald-900 dark:text-emerald-100"
                                : "text-gray-900 dark:text-gray-100"
                          }`}
                        >
                          {displayName}
                        </p>
                        <p
                          className={`text-xs ${
                            isServed
                              ? "text-slate-500 dark:text-slate-400"
                              : isReady
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {priceChanged ? (
                            <>
                              <span className="line-through opacity-70">
                                {formatOrderPrice(originalPrice)}
                              </span>{" "}
                              <span className="font-semibold text-amber-700 dark:text-amber-300">
                                {formatOrderPrice(line.price)}
                              </span>
                              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                {translate("priceAdjusted")}
                              </span>
                            </>
                          ) : (
                            <>{formatOrderPrice(line.price)} each</>
                          )}
                          {line.notes && ` · ${line.notes}`}
                          {line.station && ` · ${line.station}`}
                          {" · "}
                          <span className="font-semibold uppercase">
                            {translate(statusTranslationKey(status))}
                          </span>
                        </p>
                      </div>

                      {qtyEditable ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => adjustQuantity(line.lineId, -1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-700 dark:border-gray-600 dark:text-gray-200"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-8 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustQuantity(line.lineId, 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-700 dark:border-gray-600 dark:text-gray-200"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          {priceEditable && (
                            <button
                              type="button"
                              onClick={() => openPriceEditor(line)}
                              className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                                priceEditLineId === line.lineId
                                  ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                                  : "border-gray-200 text-gray-700 dark:border-gray-600 dark:text-gray-200"
                              }`}
                              aria-label={translate("editPrice")}
                              title={translate("editPrice")}
                            >
                              <Tag className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeLine(line.lineId)}
                            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="w-8 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {line.quantity}
                          </span>
                          {priceEditable && (
                            <button
                              type="button"
                              onClick={() => openPriceEditor(line)}
                              className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                                priceEditLineId === line.lineId
                                  ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                                  : "border-gray-200 text-gray-700 dark:border-gray-600 dark:text-gray-200"
                              }`}
                              aria-label={translate("editPrice")}
                              title={translate("editPrice")}
                            >
                              <Percent className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}

                      {isReady && line.id && (
                        <button
                          type="button"
                          disabled={servingId === line.id}
                          onClick={() => void markServed(line)}
                          className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {translate("served")}
                        </button>
                      )}

                      <span className="w-20 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                        {formatOrderPrice(line.price * line.quantity)}
                      </span>
                    </div>

                    {priceEditLineId === line.lineId && (
                      <LinePriceEditor
                        line={line}
                        menuItems={menuItems}
                        translate={translate}
                        formatOrderPrice={formatOrderPrice}
                        onApply={(mode, value) => applyPriceEdit(line.lineId, mode, value)}
                        onReset={() => resetLinePrice(line.lineId)}
                        onCancel={() => setPriceEditLineId(null)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3 dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">{translate("subtotal")}</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {formatOrderPrice(subtotal)}
            </span>
          </div>
        </Section>

        <Section title={translate("tableActions")}>
          <button
            type="button"
            onClick={onAddItems}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 py-2.5 text-sm font-semibold text-orange-800 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-200"
          >
            <Plus className="h-4 w-4" />
            {translate("addItems")}
          </button>

          <div className="mt-3">
            {!showTransfer ? (
              <button
                type="button"
                onClick={() => setShowTransfer(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <ArrowRightLeft className="h-4 w-4" />
                {translate("changeTable")}
              </button>
            ) : (
              <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                  {translate("changeTable")}
                </label>
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="pos-input py-2"
                >
                  <option value="">{translate("selectEmptyTable")}</option>
                  {emptyTables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {translate("table")} {t.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTransfer(false)}
                    className="flex-1 rounded-lg border border-gray-200 py-2 text-sm dark:border-gray-700"
                  >
                    {translate("cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={!transferTo || isSaving || emptyTables.length === 0}
                    onClick={() => void handleTransfer()}
                    className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {translate("moveOrder")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Section>

        <div className="space-y-3 pt-1">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSave()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-900 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <Save className="h-4 w-4" />
            {isSaving
              ? "..."
              : ordersPayload.length === 0
                ? translate("saveEmptyOrder")
                : translate("saveOrder")}
          </button>

          <button
            type="button"
            disabled={isSaving || lines.length === 0}
            onClick={() => void handleProceedToCheckout()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-base font-bold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-40"
          >
            <ShoppingBag className="h-5 w-5" />
            {translate("proceedToCheckout")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
