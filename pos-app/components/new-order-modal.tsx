"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, MessageSquare, Minus, Plus, Search, X } from "lucide-react";
import { CancelReasonModal } from "@/components/cancel-reason-modal";
import { ItemCustomizeModal, type CustomizeResult } from "@/components/item-customize-modal";
import { GrillGuestCountModal } from "@/components/grill-guest-count-modal";
import { LinePriceEditor } from "@/components/line-price-editor";
import { Modal } from "@/components/modal";
import { ModalOverlay, ModalPanel } from "@/components/modal-overlay";
import { OnScreenKeyboard } from "@/components/on-screen-keyboard";
import { OrderLineToolbar } from "@/components/order-line-toolbar";
import { ElapsedTimer } from "@/components/live-clock";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import { useReceiptPrint } from "@/contexts/receipt-print-context";
import { useSettings } from "@/contexts/settings-context";
import { useRegisterUnsavedWork } from "@/contexts/unsaved-work-context";
import { shouldPrintKitchenOnSend } from "@/lib/kitchen-fulfillment-mode";
import { orderLineKitchenPanelClass, resolveKitchenStatus } from "@/lib/auto-serve";
import {
  itemKitchenTimerStart,
  resolveTableOccupiedSince,
} from "@/lib/order-item-timers";
import { categoriesForOrdering } from "@/lib/category-utils";
import { sortMenuItemsForDisplay } from "@/lib/menu-sort";
import { formatPosPrice, menuPriceDisplayOptionsFromSettings } from "@/lib/price-display";
import {
  cartLineDisplayName,
  menuItemDisplayName,
  orderItemDisplayName,
} from "@/lib/menu-display";
import {
  buildCustomizationSignature,
  buildKitchenModifierText,
  buildKitchenModifierTextEn,
  hasCustomization,
  mergeNoteWithKitchenModifiers,
} from "@/lib/menu-customization";
import { finalizeNoteTranslation, presetLabel, presetsForMenuItem, togglePresetId } from "@/lib/note-presets";
import { resolveOrderLineStation, resolveStation } from "@/lib/order-routing";
import {
  finalizeBillOnlyOrder,
  isBillOnlyOrderLine,
  menuItemInputFromRoute,
  orderDispatchFromMenuItem,
  type MenuItemRoute,
} from "@/lib/menu-item-dispatch";
import {
  editableLinesToOrders,
  isSubmittedLineDirty,
  kitchenPrintDelta,
  submittedOrdersDirty,
  toEditableLines,
  type EditableLine,
} from "@/lib/editable-order-lines";
import {
  isLinePriceAdjusted,
  resolveOriginalUnitPrice,
  withAdjustedLinePrice,
  withResetLinePrice,
  type LinePriceAdjustMode,
} from "@/lib/order-line-pricing";
import {
  isManageTableLineEditable,
  isManageTablePriceEditable,
} from "@/lib/order-sla";
import { normalizeOrderItemStatus, statusTranslationKey } from "@/lib/order-status";
import { matchesFoldedSearch } from "@/lib/search-normalize";
import { isTablePaidInProgress } from "@/lib/table-payment";
import type {
  LanguageCode,
  MenuCategoryRecord,
  MenuItem,
  MenuItemLayout,
  NotePreset,
  OrderItem,
  RestaurantTable,
  SelectedMenuOption,
  Station,
} from "@/lib/types";
import { filterButtonClass } from "@/lib/theme-classes";
import type { TaxGroup } from "@/lib/receipt-config";
import { defaultTaxGroupForItemType, taxRateForGroup } from "@/lib/tax-summary";
import { cancelOrderItems } from "@/src/lib/table-actions";
import {
  buildGrillGuestPrepOrder,
  cartHasGrillItems,
  shouldPromptGrillGuestCount,
} from "@/lib/grill-guest-count";
import {
  fetchNotePresets,
  mapNotePresetsResponse,
} from "@/src/lib/note-preset-actions";
import { translateNoteToChineseAction } from "@/src/lib/translate-actions";

interface CartLine {
  lineId: string;
  menuItemId?: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  itemType: MenuItem["itemType"];
  station?: Station;
  note: string;
  noteTranslated?: string;
  isPrintedNote: boolean;
  imageUrl?: string;
  customizationSignature?: string;
  selectedOptions?: SelectedMenuOption[];
  kitchenModifierText?: string;
  specialRequestIds?: string[];
  isCustomItem?: boolean;
  skipPrint?: boolean;
  hideOnKds?: boolean;
  taxGroup?: TaxGroup;
}

interface PendingKitchenMessage {
  message: string;
  messageZh: string;
}

type KitchenMessageMode = "table" | "general";

interface NewOrderModalProps {
  open: boolean;
  tableLabel: string;
  table?: RestaurantTable;
  menuItems: MenuItem[];
  categories?: MenuCategoryRecord[];
  mode?: "new" | "append";
  existingOrders?: OrderItem[];
  onClose: () => void;
  onSendToKitchen: (orders: OrderItem[]) => void | Promise<void>;
  /** Append cart lines to bill only — no kitchen print / KDS */
  onAppendCartNoPrint?: (orders: OrderItem[]) => void | Promise<void>;
  onCheckout?: (orders: OrderItem[]) => void | Promise<void>;
  onCloseTable?: () => void | Promise<void>;
  onChangeTable?: () => void;
  onSaveExistingOrders?: (
    orders: OrderItem[],
    options?: { silent?: boolean; printOrders?: OrderItem[] },
  ) => void | Promise<void>;
  onRefreshExistingOrders?: () => void;
  isSaving?: boolean;
}

function cartLinesToOrders(lines: CartLine[]): OrderItem[] {
  return lines.map((line) => {
    const selected = line.selectedOptions ?? [];
    const kitchenZh = line.kitchenModifierText ?? buildKitchenModifierText(selected);
    const kitchenEn = buildKitchenModifierTextEn(selected);
    const merged = mergeNoteWithKitchenModifiers(
      line.note.trim() || undefined,
      line.noteTranslated,
      kitchenZh,
      kitchenEn,
    );
    return finalizeBillOnlyOrder({
      menuItemId: line.menuItemId,
      name: line.name,
      price: line.price,
      originalPrice: line.price,
      quantity: line.quantity,
      notes: merged.notes,
      notesTranslated: merged.notesTranslated,
      isPrintedNote: line.isPrintedNote,
      station: resolveOrderLineStation(line),
      status: "preparing",
      skipPrint: line.skipPrint,
      hideOnKds: line.hideOnKds,
      ...(line.isCustomItem && {
        itemType: line.itemType,
        taxGroup: line.taxGroup,
      }),
      modifiers: {
        selectedOptions: line.selectedOptions,
        specialRequestIds: line.specialRequestIds,
      },
    });
  });
}

function newLineId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function findDefaultLine(cart: CartLine[], menuItemId: string, signature?: string) {
  return cart.find(
    (line) =>
      Boolean(menuItemId) &&
      line.menuItemId === menuItemId &&
      line.note === "" &&
      !line.isPrintedNote &&
      !line.isCustomItem &&
      (signature ? line.customizationSignature === signature : !line.customizationSignature),
  );
}

function MenuItemImage({ item, label }: { item: MenuItem; label: string }) {
  if (item.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.imageUrl} alt={label} loading="lazy" decoding="async" className="h-full w-full object-cover" />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500 dark:text-gray-400">
      <span className="text-3xl font-light">{label.charAt(0)}</span>
    </div>
  );
}

function MenuOrderItemButton({
  item,
  label,
  inCartQty,
  station,
  layout,
  showMenuPrices,
  formatOrderPrice,
  soldOutLabel,
  onAdd,
}: {
  item: MenuItem;
  label: string;
  inCartQty: number;
  station: string;
  layout: MenuItemLayout;
  showMenuPrices: boolean;
  formatOrderPrice: (amount: number) => string;
  soldOutLabel: string;
  onAdd: () => void;
}) {
  const unavailable = !item.isAvailable;
  const buttonClass = `overflow-hidden rounded-xl border bg-white text-left transition active:scale-[0.98] dark:bg-gray-900 ${
    unavailable
      ? "cursor-not-allowed opacity-50"
      : "border-gray-200 hover:border-emerald-300 hover:shadow-md dark:border-gray-700 dark:hover:border-emerald-700"
  }`;

  const qtyBadge =
    inCartQty > 0 ? (
      <span
        className={`absolute rounded-full bg-emerald-600 font-bold text-white shadow ${
          layout === "horizontal"
            ? "right-0 top-0 px-1 py-px text-[9px] leading-none"
            : "right-1.5 top-1.5 px-2 py-0.5 text-[11px]"
        }`}
      >
        x{inCartQty}
      </span>
    ) : null;

  const metaRow = (
    <div className={`flex items-center justify-between gap-2 ${layout === "vertical" ? "mt-2" : "mt-1"}`}>
      {showMenuPrices ? (
        <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
          {formatOrderPrice(item.price)}
        </p>
      ) : (
        <span />
      )}
      <p className="text-[10px] text-gray-400">{station}</p>
    </div>
  );

  if (layout === "horizontal") {
    return (
      <button
        type="button"
        disabled={unavailable}
        onClick={onAdd}
        className={`flex w-full min-h-[52px] flex-row items-start gap-2.5 rounded-lg border px-2 py-2 ${buttonClass}`}
      >
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
          <MenuItemImage item={item} label={label} />
          {qtyBadge}
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
            {label}
            {unavailable && (
              <span className="ml-1 text-xs font-semibold text-red-500">({soldOutLabel})</span>
            )}
          </p>
          {showMenuPrices && (
            <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatOrderPrice(item.price)}
            </p>
          )}
          <p className="mt-0.5 text-[10px] text-gray-400">{station}</p>
        </div>
      </button>
    );
  }

  return (
    <button type="button" disabled={unavailable} onClick={onAdd} className={`flex flex-col ${buttonClass}`}>
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-gray-800">
        <MenuItemImage item={item} label={label} />
        {qtyBadge}
      </div>
      <div className="px-3 py-3">
        <p className="break-words text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
          {label}
        </p>
        {metaRow}
        {unavailable && (
          <p className="mt-2 text-center text-xs font-semibold text-red-500">{soldOutLabel}</p>
        )}
      </div>
    </button>
  );
}

export function NewOrderModal({
  open,
  tableLabel,
  table,
  menuItems,
  categories = [],
  mode = "new",
  existingOrders = [],
  onClose,
  onSendToKitchen,
  onAppendCartNoPrint,
  onCheckout,
  onCloseTable,
  onChangeTable,
  onSaveExistingOrders,
  onRefreshExistingOrders,
  isSaving = false,
}: NewOrderModalProps) {
  const { translate, language, currentStaffUser } = useApp();
  const { requestPin } = usePinGate();
  const { settings } = useSettings();
  const { printKitchenStaffMessage } = useReceiptPrint();
  const priceOptions = menuPriceDisplayOptionsFromSettings(settings);
  const formatOrderPrice = (amount: number) => formatPosPrice(amount, priceOptions);
  const showMenuPrices = settings.showPricesOnOrderScreen;
  const menuItemLayout = settings.menuItemLayout;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [submittedLines, setSubmittedLines] = useState<EditableLine[]>([]);
  const [submittedBaseline, setSubmittedBaseline] = useState<OrderItem[]>([]);
  const [pendingCancels, setPendingCancels] = useState<Array<{ itemId: string; reason: string }>>(
    [],
  );
  const [selectedSubmittedLineId, setSelectedSubmittedLineId] = useState<string | null>(null);
  const [submittedPriceEditLineId, setSubmittedPriceEditLineId] = useState<string | null>(null);
  const [submittedNoteLineId, setSubmittedNoteLineId] = useState<string | null>(null);
  const [submittedNoteDraft, setSubmittedNoteDraft] = useState("");
  const [submittedNoteDraftTranslated, setSubmittedNoteDraftTranslated] = useState("");
  const [submittedNotePresetIds, setSubmittedNotePresetIds] = useState<string[]>([]);
  const [submittedNoteTranslating, setSubmittedNoteTranslating] = useState(false);
  const [submittedNoteTranslateEnabled, setSubmittedNoteTranslateEnabled] = useState(false);
  const [submittedCancelTarget, setSubmittedCancelTarget] = useState<{
    lineId: string;
    itemIds: string[];
  } | null>(null);
  const [submittedLineError, setSubmittedLineError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchKeyboardOpen, setSearchKeyboardOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("__all__");
  const [cartOpen, setCartOpen] = useState(false);
  const [noteLineId, setNoteLineId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteDraftTranslated, setNoteDraftTranslated] = useState("");
  const [noteTranslating, setNoteTranslating] = useState(false);
  const [noteTranslateEnabled, setNoteTranslateEnabled] = useState(false);
  const [notePrintOnReceipt, setNotePrintOnReceipt] = useState(false);
  const [notePresetIds, setNotePresetIds] = useState<string[]>([]);
  const [notePresets, setNotePresets] = useState<NotePreset[]>([]);
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [grillGuestCount, setGrillGuestCount] = useState<number | null>(null);
  const [grillGuestModalOpen, setGrillGuestModalOpen] = useState(false);
  const [pendingGrillItem, setPendingGrillItem] = useState<MenuItem | null>(null);
  const [pendingCustomizeResult, setPendingCustomizeResult] = useState<CustomizeResult | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [unsavedConfirmMode, setUnsavedConfirmMode] = useState<"close" | "outside" | null>(null);
  const orderPanelRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);
  /** Blocks duplicate Send taps before parent `isSaving` flips. */
  const actionLockRef = useRef(false);
  const [isSending, setIsSending] = useState(false);
  const isBusy = isSaving || isSending;
  const [kitchenMessageOpen, setKitchenMessageOpen] = useState(false);
  const [kitchenMessageMode, setKitchenMessageMode] = useState<KitchenMessageMode>("table");
  const [kitchenMessageDraft, setKitchenMessageDraft] = useState("");
  const [kitchenMessageTranslated, setKitchenMessageTranslated] = useState("");
  const [kitchenMessageTranslating, setKitchenMessageTranslating] = useState(false);
  const [kitchenMessageTranslateEnabled, setKitchenMessageTranslateEnabled] = useState(false);
  const [kitchenMessageBusy, setKitchenMessageBusy] = useState(false);
  const [kitchenMessageError, setKitchenMessageError] = useState<string | null>(null);
  const [pendingKitchenMessage, setPendingKitchenMessage] = useState<PendingKitchenMessage | null>(
    null,
  );
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [customItemQty, setCustomItemQty] = useState("1");
  const [customItemRoute, setCustomItemRoute] = useState<MenuItemRoute>("none");
  const [customItemType, setCustomItemType] = useState<MenuItem["itemType"]>("food");
  const [customItemTaxGroup, setCustomItemTaxGroup] = useState<TaxGroup>("B");
  const [customItemError, setCustomItemError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetchNotePresets().then(({ data }) => {
      setNotePresets(mapNotePresetsResponse(data));
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCart([]);
    setSearch("");
    setSearchKeyboardOpen(false);
    setActiveCategory("__all__");
    setCartOpen(false);
    setNoteLineId(null);
    setNoteDraft("");
    setNoteDraftTranslated("");
    setNoteTranslating(false);
    setNotePrintOnReceipt(false);
    setNotePresetIds([]);
    setCustomizeItem(null);
    setGrillGuestCount(null);
    setGrillGuestModalOpen(false);
    setPendingGrillItem(null);
    setPendingCustomizeResult(null);
    setDiscardConfirmOpen(false);
    setKitchenMessageOpen(false);
    setKitchenMessageDraft("");
    setKitchenMessageTranslated("");
    setKitchenMessageTranslating(false);
    setKitchenMessageBusy(false);
    setKitchenMessageError(null);
    setPendingKitchenMessage(null);
    setCustomItemOpen(false);
    setCustomItemName("");
    setCustomItemPrice("");
    setCustomItemQty("1");
    setCustomItemRoute("none");
    setCustomItemType("food");
    setCustomItemTaxGroup("B");
    setCustomItemError(null);
    setSelectedSubmittedLineId(null);
    setSubmittedPriceEditLineId(null);
    setSubmittedNoteLineId(null);
    setSubmittedLineError(null);
    setSubmittedBaseline([]);
    setPendingCancels([]);
    setUnsavedConfirmMode(null);
  }, [open]);

  useEffect(() => {
    const note = noteDraft.trim();
    if (!note || !noteTranslateEnabled) {
      setNoteDraftTranslated("");
      setNoteTranslating(false);
      return;
    }

    setNoteTranslating(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void translateNoteToChineseAction(note).then((translated) => {
        if (!cancelled) {
          setNoteDraftTranslated(translated);
          setNoteTranslating(false);
        }
      });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [noteDraft, noteTranslateEnabled]);

  useEffect(() => {
    const message = kitchenMessageDraft.trim();
    if (!message || !kitchenMessageTranslateEnabled) {
      setKitchenMessageTranslated("");
      setKitchenMessageTranslating(false);
      return;
    }

    setKitchenMessageTranslating(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void translateNoteToChineseAction(message).then((translated) => {
        if (!cancelled) {
          setKitchenMessageTranslated(translated);
          setKitchenMessageTranslating(false);
        }
      });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [kitchenMessageDraft, kitchenMessageTranslateEnabled]);

  useEffect(() => {
    const note = submittedNoteDraft.trim();
    if (!note || !submittedNoteTranslateEnabled) {
      setSubmittedNoteDraftTranslated("");
      setSubmittedNoteTranslating(false);
      return;
    }

    setSubmittedNoteTranslating(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void translateNoteToChineseAction(note).then((translated) => {
        if (!cancelled) {
          setSubmittedNoteDraftTranslated(translated);
          setSubmittedNoteTranslating(false);
        }
      });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [submittedNoteDraft, submittedNoteTranslateEnabled]);

  const categoryOptions = useMemo(
    () => categoriesForOrdering(categories, settings.menuCategorySortMode),
    [categories, settings.menuCategorySortMode],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim();
    const filtered = menuItems.filter((item) => {
      const matchesCategory =
        activeCategory === "__all__" ||
        item.categoryId === activeCategory ||
        item.category === activeCategory ||
        categoryOptions.find((c) => c.id === activeCategory)?.name === item.category;
      const label = menuItemDisplayName(item, language);
      const matchesSearch =
        !query ||
        matchesFoldedSearch(label, query) ||
        matchesFoldedSearch(item.nameEn, query) ||
        matchesFoldedSearch(item.nameCz, query) ||
        matchesFoldedSearch(item.nameZh, query) ||
        matchesFoldedSearch(item.id, query);
      return matchesCategory && matchesSearch;
    });
    return sortMenuItemsForDisplay(filtered, settings.menuItemSortMode);
  }, [
    menuItems,
    activeCategory,
    search,
    language,
    categoryOptions,
    settings.menuItemSortMode,
  ]);

  const submittedOrdersRaw = useMemo(
    () =>
      existingOrders.filter((item) => {
        const kitchen = resolveKitchenStatus(item);
        return kitchen !== "archived" && !item.isCancelled && kitchen !== "cancelled";
      }),
    [existingOrders],
  );

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;

    if (!open || mode !== "append") {
      if (!open) {
        setSubmittedLines([]);
        setSubmittedBaseline([]);
        setPendingCancels([]);
      }
      return;
    }

    const syncFromServer = () => {
      const lines = toEditableLines(submittedOrdersRaw, [], menuItems);
      setSubmittedLines(lines);
      setSubmittedBaseline(submittedOrdersRaw);
      setPendingCancels([]);
      setSelectedSubmittedLineId((current) =>
        current && lines.some((line) => line.lineId === current) ? current : null,
      );
    };

    if (justOpened) {
      syncFromServer();
      return;
    }

    if (cart.length > 0 || pendingCancels.length > 0) return;

    const draftOrders = editableLinesToOrders(submittedLines);
    if (submittedOrdersDirty(draftOrders, submittedBaseline)) return;

    if (submittedOrdersDirty(submittedOrdersRaw, submittedBaseline)) {
      syncFromServer();
    }
  }, [
    open,
    mode,
    submittedOrdersRaw,
    menuItems,
    cart.length,
    pendingCancels.length,
    submittedLines,
    submittedBaseline,
  ]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const submittedTotal = submittedLines.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const billTotal = submittedTotal + cartTotal;

  const hasKitchenWork = submittedLines.some((item) => {
    const kitchen = resolveKitchenStatus(item);
    return kitchen === "pending" || kitchen === "ready";
  });

  const isPaid = table ? isTablePaidInProgress(table) : false;

  const selectedSubmittedLine = submittedLines.find(
    (line) => line.lineId === selectedSubmittedLineId,
  );
  const submittedNoteLine = submittedLines.find(
    (line) => line.lineId === submittedNoteLineId,
  );
  const submittedNoteMenuItem = submittedNoteLine?.menuItemId
    ? menuItems.find((item) => item.id === submittedNoteLine.menuItemId)
    : undefined;
  const submittedNoteLinePresets = submittedNoteMenuItem
    ? presetsForMenuItem(notePresets, submittedNoteMenuItem)
    : notePresets;

  const submittedDraftOrders = useMemo(
    () => editableLinesToOrders(submittedLines),
    [submittedLines],
  );

  const hasSubmittedChanges =
    pendingCancels.length > 0 ||
    submittedOrdersDirty(submittedDraftOrders, submittedBaseline);

  const hasPendingSend =
    Boolean(pendingKitchenMessage) ||
    (mode === "append" ? cart.length > 0 || hasSubmittedChanges : cart.length > 0);

  const hasUnsavedChanges = cart.length > 0 || hasSubmittedChanges || Boolean(pendingKitchenMessage);

  const canCheckout =
    Boolean(onCheckout) &&
    submittedLines.length > 0 &&
    !isPaid &&
    cart.length === 0 &&
    !hasSubmittedChanges;

  const persistSubmittedLines = async (
    nextLines: EditableLine[],
    options: { silent: boolean },
  ) => {
    if (!onSaveExistingOrders) return;
    setSubmittedLineError(null);
    const orders = editableLinesToOrders(nextLines).map((item) => ({
      ...item,
      skipPrint: options.silent,
      hideOnKds: options.silent,
    }));
    const printOrders = options.silent
      ? undefined
      : kitchenPrintDelta(submittedBaseline, orders);
    try {
      await onSaveExistingOrders(orders, {
        silent: options.silent,
        printOrders,
      });
      setSubmittedBaseline(orders);
      setPendingCancels([]);
      onRefreshExistingOrders?.();
    } catch (error) {
      setSubmittedLineError(error instanceof Error ? error.message : "Failed to save order.");
      throw error;
    }
  };

  const handleSaveSubmittedChanges = async (options: {
    silent: boolean;
  }): Promise<boolean> => {
    if (!onSaveExistingOrders || !table || !hasSubmittedChanges) return true;
    setSubmittedLineError(null);
    try {
      const actor = currentStaffUser?.name?.trim() || "Staff";
      const cancelsByReason = new Map<string, string[]>();
      for (const entry of pendingCancels) {
        const ids = cancelsByReason.get(entry.reason) ?? [];
        ids.push(entry.itemId);
        cancelsByReason.set(entry.reason, ids);
      }
      for (const [reason, ids] of cancelsByReason) {
        const { error } = await cancelOrderItems(ids, table.id, reason, actor, {
          tableLabel: table.label,
          staffId: currentStaffUser?.id,
        });
        if (error) throw error;
      }
      await persistSubmittedLines(submittedLines, options);
      return true;
    } catch (error) {
      setSubmittedLineError(error instanceof Error ? error.message : "Failed to save order.");
      return false;
    }
  };

  const revertSubmittedChanges = () => {
    const lines = toEditableLines(submittedBaseline, [], menuItems);
    setSubmittedLines(lines);
    setSubmittedBaseline(submittedBaseline);
    setPendingCancels([]);
    setSelectedSubmittedLineId(null);
    setSubmittedPriceEditLineId(null);
    setSubmittedNoteLineId(null);
    setSubmittedLineError(null);
  };

  const applySubmittedQuantityChange = (lineId: string, delta: number) => {
    setSubmittedPriceEditLineId(null);
    const next = submittedLines
      .map((line) => {
        if (line.lineId !== lineId) return line;
        const newQty = line.quantity + delta;
        if (newQty <= 0) return null;
        let unitIds = line.unitIds;
        if (delta < 0 && unitIds && unitIds.length > 0) {
          unitIds = unitIds.slice(0, newQty);
        }
        return {
          ...line,
          quantity: newQty,
          unitIds,
          id: unitIds?.[0] ?? line.id,
        };
      })
      .filter((line): line is EditableLine => line !== null);
    setSubmittedLines(next);
    if (next.length === 0) setSelectedSubmittedLineId(null);
  };

  const adjustSubmittedQuantity = (lineId: string, delta: number) => {
    if (delta < 0) {
      const line = submittedLines.find((entry) => entry.lineId === lineId);
      if (line?.id || (line?.unitIds?.length ?? 0) > 0) {
        requestPin(() => applySubmittedQuantityChange(lineId, delta));
        return;
      }
    }
    applySubmittedQuantityChange(lineId, delta);
  };

  const applySubmittedPriceEdit = (
    lineId: string,
    mode: LinePriceAdjustMode,
    value: number,
  ) => {
    const next = submittedLines.map((line) =>
      line.lineId === lineId
        ? { ...line, ...withAdjustedLinePrice(line, menuItems, mode, value) }
        : line,
    );
    setSubmittedLines(next);
    setSubmittedPriceEditLineId(null);
  };

  const resetSubmittedLinePrice = (lineId: string) => {
    const next = submittedLines.map((line) =>
      line.lineId === lineId ? { ...line, ...withResetLinePrice(line, menuItems) } : line,
    );
    setSubmittedLines(next);
    setSubmittedPriceEditLineId(null);
  };

  const openSubmittedNoteModal = (line: EditableLine) => {
    setSubmittedNoteLineId(line.lineId);
    setSubmittedNoteDraft(line.notes ?? "");
    setSubmittedNoteDraftTranslated(line.notesTranslated ?? "");
    const presetIds = line.modifiers?.specialRequestIds ?? [];
    setSubmittedNotePresetIds(presetIds);
    const storedNote = line.notes?.trim() ?? "";
    const storedTranslated = line.notesTranslated?.trim() ?? "";
    setSubmittedNoteTranslateEnabled(
      presetIds.length > 0 ||
        Boolean(storedTranslated && storedTranslated !== storedNote),
    );
  };

  const closeSubmittedNoteModal = () => {
    setSubmittedNoteLineId(null);
    setSubmittedNoteDraft("");
    setSubmittedNoteDraftTranslated("");
    setSubmittedNotePresetIds([]);
    setSubmittedNoteTranslating(false);
    setSubmittedNoteTranslateEnabled(false);
  };

  const handleSaveSubmittedNote = async () => {
    if (!submittedNoteLineId) return;
    const { note, noteTranslated } = await finalizeNoteTranslation(
      notePresets,
      submittedNotePresetIds,
      submittedNoteDraft,
      language,
      { translate: submittedNoteTranslateEnabled },
    );
    const next = submittedLines.map((line) =>
      line.lineId === submittedNoteLineId
        ? {
            ...line,
            notes: note || undefined,
            notesTranslated: noteTranslated || undefined,
            modifiers: {
              ...line.modifiers,
              specialRequestIds:
                submittedNotePresetIds.length > 0 ? submittedNotePresetIds : undefined,
            },
          }
        : line,
    );
    setSubmittedLines(next);
    closeSubmittedNoteModal();
  };

  const requestRemoveSubmittedLine = (line: EditableLine) => {
    const itemIds = line.unitIds?.length
      ? [...line.unitIds]
      : line.id
        ? [line.id]
        : [];
    if (itemIds.length === 0) {
      adjustSubmittedQuantity(line.lineId, -line.quantity);
      return;
    }
    requestPin(() => setSubmittedCancelTarget({ lineId: line.lineId, itemIds }));
  };

  const handleSubmittedCancelConfirm = (reason: string) => {
    if (!submittedCancelTarget) return;
    setSubmittedLineError(null);
    setPendingCancels((prev) => [
      ...prev,
      ...submittedCancelTarget.itemIds.map((itemId) => ({ itemId, reason })),
    ]);
    const next = submittedLines.filter(
      (line) => line.lineId !== submittedCancelTarget.lineId,
    );
    setSubmittedLines(next);
    if (selectedSubmittedLineId === submittedCancelTarget.lineId) {
      setSelectedSubmittedLineId(null);
    }
    setSubmittedCancelTarget(null);
  };

  const cartQtyByMenuId = useMemo(() => {
    const totals = new Map<string, number>();
    for (const line of cart) {
      if (!line.menuItemId) continue;
      totals.set(line.menuItemId, (totals.get(line.menuItemId) ?? 0) + line.quantity);
    }
    return totals;
  }, [cart]);

  const noteLine = noteLineId ? cart.find((line) => line.lineId === noteLineId) : undefined;
  const noteLineMenuItem = noteLine
    ? menuItems.find((item) => item.id === noteLine.menuItemId)
    : undefined;
  const noteLinePresets = useMemo(
    () => presetsForMenuItem(notePresets, noteLineMenuItem),
    [notePresets, noteLineMenuItem],
  );

  const modalTitle =
    mode === "append"
      ? `${translate("addMoreItems")} — ${translate("table")} ${tableLabel}`
      : `${translate("newOrder")} — ${translate("table")} ${tableLabel}`;

  const tableOccupiedSince =
    mode === "append" && table
      ? resolveTableOccupiedSince(table, submittedOrdersRaw)
      : null;

  const quickAdd = (item: MenuItem) => {
    if (!item.isAvailable) return;
    setSearch("");
    if (hasCustomization(item)) {
      setCustomizeItem(item);
      return;
    }
    if (
      shouldPromptGrillGuestCount({
        item,
        cart,
        existingOrders,
        menuItems,
        guestCountCollected: grillGuestCount !== null,
      })
    ) {
      setPendingGrillItem(item);
      setPendingCustomizeResult(null);
      setGrillGuestModalOpen(true);
      return;
    }
    addItemToCart(item);
  };

  const addItemToCart = (item: MenuItem) => {
    const label = menuItemDisplayName(item, language);
    const dispatch = orderDispatchFromMenuItem(item);
    setCart((prev) => {
      const existing = findDefaultLine(prev, item.id);
      if (existing) {
        return prev.map((line) =>
          line.lineId === existing.lineId
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [
        ...prev,
        {
          lineId: newLineId(),
          menuItemId: item.id,
          name: label,
          price: item.price,
          quantity: 1,
          category: item.category,
          itemType: item.itemType,
          station: item.station,
          note: "",
          isPrintedNote: false,
          imageUrl: item.imageUrl,
          ...dispatch,
        },
      ];
    });
  };

  const applyCustomizeResult = async (item: MenuItem, result: CustomizeResult) => {
    const signature = buildCustomizationSignature(item.id, result.selections);

    let itemNoteTranslated = "";
    if (result.itemNote) {
      itemNoteTranslated = result.translateItemNote
        ? await translateNoteToChineseAction(result.itemNote)
        : result.itemNote;
    }

    const dispatch = orderDispatchFromMenuItem(item);
    const mainLine: CartLine = {
      lineId: newLineId(),
      menuItemId: item.id,
      name: result.displayName,
      price: result.price,
      quantity: 1,
      category: item.category,
      itemType: item.itemType,
      station: item.station,
      note: result.itemNote,
      noteTranslated: itemNoteTranslated || undefined,
      isPrintedNote: false,
      imageUrl: item.imageUrl,
      customizationSignature: signature,
      selectedOptions: result.selectedOptions,
      kitchenModifierText: result.kitchenModifierText,
      ...dispatch,
    };

    setCart((prev) => {
      const existing = findDefaultLine(prev, item.id, signature);
      if (existing) {
        return prev.map((line) =>
          line.lineId === existing.lineId
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [...prev, mainLine];
    });
  };

  const handleCustomizeConfirm = async (result: CustomizeResult) => {
    const item = customizeItem;
    if (!item) return;

    setCustomizeItem(null);

    if (
      shouldPromptGrillGuestCount({
        item,
        cart,
        existingOrders,
        menuItems,
        guestCountCollected: grillGuestCount !== null,
      })
    ) {
      setPendingGrillItem(item);
      setPendingCustomizeResult(result);
      setGrillGuestModalOpen(true);
      return;
    }

    await applyCustomizeResult(item, result);
  };

  const handleGrillGuestConfirm = async (count: number) => {
    setGrillGuestCount(count);
    setGrillGuestModalOpen(false);

    if (pendingGrillItem && pendingCustomizeResult) {
      await applyCustomizeResult(pendingGrillItem, pendingCustomizeResult);
    } else if (pendingGrillItem) {
      addItemToCart(pendingGrillItem);
    }

    setPendingGrillItem(null);
    setPendingCustomizeResult(null);
  };

  const handleGrillGuestClose = () => {
    setGrillGuestModalOpen(false);
    setPendingGrillItem(null);
    setPendingCustomizeResult(null);
  };

  const openNoteModal = (line: CartLine) => {
    setNoteLineId(line.lineId);
    setNoteDraft(line.note);
    setNoteDraftTranslated(line.noteTranslated ?? "");
    const presetIds = line.specialRequestIds ?? [];
    setNotePresetIds(presetIds);
    setNoteTranslating(false);
    setNoteTranslateEnabled(
      presetIds.length > 0 ||
        Boolean(line.noteTranslated?.trim() && line.noteTranslated.trim() !== line.note.trim()),
    );
    setNotePrintOnReceipt(line.isPrintedNote);
  };

  const closeNoteModal = () => {
    setNoteLineId(null);
    setNoteDraft("");
    setNoteDraftTranslated("");
    setNotePresetIds([]);
    setNoteTranslating(false);
    setNoteTranslateEnabled(false);
    setNotePrintOnReceipt(false);
  };

  const handleSaveNote = async () => {
    if (!noteLineId) return;
    const { note, noteTranslated } = await finalizeNoteTranslation(
      notePresets,
      notePresetIds,
      noteDraft,
      language,
      { translate: noteTranslateEnabled },
    );

    setCart((prev) =>
      prev.map((line) =>
        line.lineId === noteLineId
          ? {
              ...line,
              note,
              noteTranslated: noteTranslated || undefined,
              isPrintedNote: notePrintOnReceipt,
              specialRequestIds: notePresetIds,
              customizationSignature: line.customizationSignature
                ? `${line.customizationSignature}|sr:${notePresetIds.join(",")}|n:${note}`
                : `sr:${notePresetIds.join(",")}|n:${note}`,
            }
          : line,
      ),
    );
    closeNoteModal();
  };

  const openKitchenMessageModal = (mode: KitchenMessageMode) => {
    setKitchenMessageMode(mode);
    setKitchenMessageError(null);
    setKitchenMessageTranslateEnabled(false);
    if (mode === "table") {
      setKitchenMessageDraft(pendingKitchenMessage?.message ?? "");
      setKitchenMessageTranslated(pendingKitchenMessage?.messageZh ?? "");
      setKitchenMessageTranslateEnabled(
        Boolean(
          pendingKitchenMessage?.messageZh?.trim() &&
            pendingKitchenMessage.messageZh.trim() !== pendingKitchenMessage.message.trim(),
        ),
      );
    } else {
      setKitchenMessageDraft("");
      setKitchenMessageTranslated("");
    }
    setKitchenMessageOpen(true);
  };

  const resolveKitchenMessageZh = async (message: string) => {
    if (!kitchenMessageTranslateEnabled) return message;
    return kitchenMessageTranslated.trim() || (await translateNoteToChineseAction(message));
  };

  const handleQueueKitchenMessage = async () => {
    const message = kitchenMessageDraft.trim();
    if (!message || kitchenMessageBusy) return;

    setKitchenMessageBusy(true);
    setKitchenMessageError(null);
    try {
      const messageZh = await resolveKitchenMessageZh(message);
      setPendingKitchenMessage({ message, messageZh });
      setKitchenMessageOpen(false);
      setKitchenMessageDraft("");
      setKitchenMessageTranslated("");
    } catch (error) {
      setKitchenMessageError(error instanceof Error ? error.message : "Failed to save message");
    } finally {
      setKitchenMessageBusy(false);
    }
  };

  const handleSendGeneralKitchenMessage = async () => {
    const message = kitchenMessageDraft.trim();
    if (!message || kitchenMessageBusy) return;

    if (!shouldPrintKitchenOnSend(settings)) {
      setKitchenMessageError(translate("kitchenPrintDisabled"));
      return;
    }

    setKitchenMessageBusy(true);
    setKitchenMessageError(null);
    try {
      const messageZh = await resolveKitchenMessageZh(message);
      await printKitchenStaffMessage({ message, messageZh });
      setKitchenMessageOpen(false);
      setKitchenMessageDraft("");
      setKitchenMessageTranslated("");
    } catch (error) {
      setKitchenMessageError(error instanceof Error ? error.message : "Print failed");
    } finally {
      setKitchenMessageBusy(false);
    }
  };

  const handleKitchenMessageSubmit = async () => {
    if (kitchenMessageMode === "general") {
      await handleSendGeneralKitchenMessage();
    } else {
      await handleQueueKitchenMessage();
    }
  };

  const flushPendingKitchenMessage = async () => {
    if (!pendingKitchenMessage) return;
    if (!shouldPrintKitchenOnSend(settings)) {
      throw new Error(translate("kitchenPrintDisabled"));
    }
    await printKitchenStaffMessage({
      tableLabel,
      message: pendingKitchenMessage.message,
      messageZh: pendingKitchenMessage.messageZh,
    });
    setPendingKitchenMessage(null);
  };

  const updateCartQty = (lineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) =>
          line.lineId === lineId
            ? { ...line, quantity: Math.max(0, line.quantity + delta) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const addCustomItemToCart = () => {
    const name = customItemName.trim();
    const price = Number(customItemPrice);
    const quantity = Math.max(1, Math.floor(Number(customItemQty) || 1));
    if (!name) {
      setCustomItemError(translate("customItemNameRequired"));
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setCustomItemError(translate("customItemPriceInvalid"));
      return;
    }
    setCustomItemError(null);
    const routing = menuItemInputFromRoute(customItemRoute);
    const dispatch = orderDispatchFromMenuItem({ billOnly: routing.billOnly });
    setCart((prev) => [
      ...prev,
      {
        lineId: newLineId(),
        name,
        price,
        quantity,
        category: "Custom",
        itemType: customItemType,
        taxGroup: customItemTaxGroup,
        station: routing.station,
        note: "",
        isPrintedNote: false,
        isCustomItem: true,
        skipPrint: dispatch.skipPrint,
        hideOnKds: dispatch.hideOnKds,
      },
    ]);
    setCustomItemOpen(false);
    setCustomItemName("");
    setCustomItemPrice("");
    setCustomItemQty("1");
    setCustomItemRoute("none");
    setCustomItemType("food");
    setCustomItemTaxGroup("B");
    setCartOpen(true);
  };

  const buildCartOrdersFromLines = async (): Promise<OrderItem[]> => {
    const orders: OrderItem[] = await Promise.all(
      cart.map(async (line) => {
        const { note } = await finalizeNoteTranslation(
          notePresets,
          line.specialRequestIds ?? [],
          line.note,
          language,
          { translate: false },
        );
        const noteTranslated = line.noteTranslated?.trim() || note;
        const selected = line.selectedOptions ?? [];
        const kitchenZh = line.kitchenModifierText ?? buildKitchenModifierText(selected);
        const kitchenEn = buildKitchenModifierTextEn(selected);
        const merged = mergeNoteWithKitchenModifiers(
          note,
          noteTranslated,
          kitchenZh,
          kitchenEn,
        );
        const menuItem = line.menuItemId
          ? menuItems.find((entry) => entry.id === line.menuItemId)
          : undefined;
        const dispatch =
          line.skipPrint != null || line.hideOnKds != null
            ? { skipPrint: line.skipPrint, hideOnKds: line.hideOnKds }
            : orderDispatchFromMenuItem(menuItem);
        return finalizeBillOnlyOrder({
          menuItemId: line.menuItemId,
          name: line.name,
          price: line.price,
          originalPrice: line.price,
          quantity: line.quantity,
          notes: merged.notes,
          notesTranslated: merged.notesTranslated,
          isPrintedNote: line.isPrintedNote,
          station: resolveOrderLineStation(line),
          status: "preparing" as const,
          ...dispatch,
          ...(line.isCustomItem && {
            itemType: line.itemType,
            taxGroup: line.taxGroup,
          }),
          modifiers: {
            selectedOptions: line.selectedOptions,
            specialRequestIds: line.specialRequestIds,
          },
        });
      }),
    );

    if (grillGuestCount !== null && cartHasGrillItems(cart)) {
      orders.unshift(buildGrillGuestPrepOrder(grillGuestCount));
    }

    return orders;
  };

  const dismissSubmittedLineSelection = () => {
    setSelectedSubmittedLineId(null);
    setSubmittedPriceEditLineId(null);
  };

  const handleSend = async () => {
    if (!hasPendingSend || isBusy || actionLockRef.current) return;

    actionLockRef.current = true;
    setIsSending(true);
    try {
      if (hasSubmittedChanges) {
        const saved = await handleSaveSubmittedChanges({ silent: false });
        if (!saved) return;
      }

      setSubmittedLineError(null);
      if (cart.length > 0) {
        const orders = await buildCartOrdersFromLines();
        await onSendToKitchen(orders);
        setCart([]);
        setCartOpen(false);
        setGrillGuestCount(null);
      }

      if (pendingKitchenMessage) {
        await flushPendingKitchenMessage();
      }

      // Close after a successful Send. Save no print intentionally keeps the menu open.
      onClose();
    } catch (error) {
      setSubmittedLineError(error instanceof Error ? error.message : "Failed to send.");
    } finally {
      actionLockRef.current = false;
      setIsSending(false);
    }
  };

  const handleSaveNoPrint = async () => {
    if (isBusy || actionLockRef.current) return;
    if (!hasSubmittedChanges && cart.length === 0) return;

    actionLockRef.current = true;
    setIsSending(true);
    try {
      if (hasSubmittedChanges && mode === "append") {
        const saved = await handleSaveSubmittedChanges({ silent: true });
        if (!saved) return;
      }

      if (cart.length > 0) {
        if (!onAppendCartNoPrint) return;
        const orders = await buildCartOrdersFromLines();
        await onAppendCartNoPrint(orders);
        setCart([]);
        setGrillGuestCount(null);
        onRefreshExistingOrders?.();
      }
    } finally {
      actionLockRef.current = false;
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setDiscardConfirmOpen(false);
    setUnsavedConfirmMode(null);
    setCart([]);
    setPendingKitchenMessage(null);
    onClose();
  };

  const openUnsavedConfirm = (mode: "close" | "outside") => {
    setUnsavedConfirmMode(mode);
    setDiscardConfirmOpen(true);
  };

  const requestClose = () => {
    if (hasUnsavedChanges) {
      openUnsavedConfirm("close");
      return;
    }
    handleClose();
  };

  const handleUnsavedDiscard = () => {
    const mode = unsavedConfirmMode;
    revertSubmittedChanges();
    setCart([]);
    setPendingKitchenMessage(null);
    setDiscardConfirmOpen(false);
    setUnsavedConfirmMode(null);
    if (mode === "close") {
      handleClose();
    }
  };

  const handleUnsavedSave = async () => {
    const mode = unsavedConfirmMode;
    setDiscardConfirmOpen(false);
    setUnsavedConfirmMode(null);
    if (hasSubmittedChanges) {
      const saved = await handleSaveSubmittedChanges({ silent: true });
      if (!saved) return;
    }
    if (mode === "close") {
      if (cart.length > 0 || pendingKitchenMessage) {
        await handleSend();
      }
      handleClose();
    }
  };

  const saveAllOrderChanges = useCallback(async (): Promise<boolean> => {
    if (hasSubmittedChanges) {
      const saved = await handleSaveSubmittedChanges({ silent: true });
      if (!saved) return false;
    }
    if (cart.length > 0 || pendingKitchenMessage) {
      await handleSend();
    }
    return true;
  }, [
    hasSubmittedChanges,
    cart.length,
    pendingKitchenMessage,
    handleSaveSubmittedChanges,
    handleSend,
  ]);

  useRegisterUnsavedWork({
    id: "order-modal",
    isDirty: () => open && hasUnsavedChanges,
    onSave: saveAllOrderChanges,
  });

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (kitchenMessageOpen) {
        if (!kitchenMessageBusy) setKitchenMessageOpen(false);
        return;
      }
      if (noteLineId) return;
      if (discardConfirmOpen) {
        setDiscardConfirmOpen(false);
        setUnsavedConfirmMode(null);
        return;
      }
      if (selectedSubmittedLineId) {
        dismissSubmittedLineSelection();
        return;
      }
      requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    open,
    noteLineId,
    discardConfirmOpen,
    cart.length,
    onClose,
    kitchenMessageOpen,
    kitchenMessageBusy,
    selectedSubmittedLineId,
  ]);

  const isLineSentToKitchen = (line: OrderItem) => {
    if (line.isCancelled || line.hideOnKds || line.skipPrint) return false;
    const kitchen = resolveKitchenStatus(line);
    return kitchen !== "archived" && kitchen !== "cancelled";
  };

  const canSaveNoPrint =
    !isBusy &&
    ((mode === "append" && hasSubmittedChanges && Boolean(onSaveExistingOrders)) ||
      (cart.length > 0 && Boolean(onAppendCartNoPrint)));

  const renderCartPanel = (showCloseButton: boolean) => (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {translate("table")} {tableLabel}
          </h3>
          {isPaid && (
            <span className="mt-1 inline-flex rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {translate("paidBadge")}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onChangeTable && mode === "append" && (
            <button
              type="button"
              onClick={onChangeTable}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
            >
              {translate("changeTable")}
            </button>
          )}
          {showCloseButton && (
            <button
              type="button"
              onClick={() => setCartOpen(false)}
              className="touch-target flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="h-6 w-6" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {submittedLineError && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {submittedLineError}
          </p>
        )}

        {submittedLines.length === 0 && cart.length === 0 && !pendingKitchenMessage ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {translate("cartEmpty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {submittedLines.map((line) => {
              const selected = line.lineId === selectedSubmittedLineId;
              const displayName = orderItemDisplayName(line, menuItems, language);
              const linePending =
                hasSubmittedChanges && isSubmittedLineDirty(line, submittedBaseline);
              const showTick = !linePending && isLineSentToKitchen(line);
              const priceChanged = isLinePriceAdjusted(line, menuItems);
              const originalPrice = resolveOriginalUnitPrice(line, menuItems);
              const status = normalizeOrderItemStatus(line.status);
              const kitchen = resolveKitchenStatus(line);
              const statusClass = orderLineKitchenPanelClass(line);
              const prepTimerStart = itemKitchenTimerStart(line);

              return (
                <li
                  key={line.lineId}
                  className={`overflow-hidden rounded-xl border ${statusClass} ${
                    selected ? "ring-2 ring-blue-400 dark:ring-blue-500" : ""
                  } ${linePending ? "ring-2 ring-orange-400 dark:ring-orange-500" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSubmittedLineId((current) =>
                        current === line.lineId ? null : line.lineId,
                      );
                      setSubmittedPriceEditLineId(null);
                    }}
                    className={`flex w-full items-start gap-2 px-3 py-3 text-left transition hover:brightness-[0.98] dark:hover:brightness-110 ${
                      linePending ? "text-orange-800 dark:text-orange-200" : "text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center">
                      {showTick ? (
                        <Check className="h-5 w-5 text-emerald-600" strokeWidth={3} />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold leading-snug">
                        {line.quantity}× {displayName}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-80">
                        <span>
                          {translate(
                            kitchen === "ready"
                              ? "ready"
                              : kitchen === "served"
                                ? "served"
                                : statusTranslationKey(status),
                          )}
                        </span>
                        {prepTimerStart && (
                          <ElapsedTimer
                            start={prepTimerStart}
                            className="rounded bg-amber-200/80 px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-amber-950 dark:bg-amber-900/60 dark:text-amber-100"
                          />
                        )}
                      </p>
                      {(line.notes || line.notesTranslated) && (
                        <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
                          {line.notesTranslated || line.notes}
                        </p>
                      )}
                      {priceChanged && (
                        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                          <span className="line-through opacity-70">
                            {formatOrderPrice(originalPrice)}
                          </span>{" "}
                          {formatOrderPrice(line.price)}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-base font-bold tabular-nums">
                      {formatOrderPrice(line.price * line.quantity)}
                    </span>
                  </button>
                  {selected && onSaveExistingOrders && (
                    <OrderLineToolbar
                      layout="inline"
                      translate={translate}
                      qtyEditable={isManageTableLineEditable(line.status)}
                      priceEditable={isManageTablePriceEditable(line.status)}
                      priceActive={submittedPriceEditLineId === line.lineId}
                      disabled={isBusy}
                      onDismiss={dismissSubmittedLineSelection}
                      onSpecialRequest={() => openSubmittedNoteModal(line)}
                      onEditPrice={() =>
                        requestPin(() =>
                          setSubmittedPriceEditLineId((current) =>
                            current === line.lineId ? null : line.lineId,
                          ),
                        )
                      }
                      onIncrease={() => adjustSubmittedQuantity(line.lineId, 1)}
                      onDecrease={() => adjustSubmittedQuantity(line.lineId, -1)}
                      onDelete={() => requestRemoveSubmittedLine(line)}
                    />
                  )}
                  {submittedPriceEditLineId === line.lineId && (
                    <div className="px-2 pb-2">
                      <LinePriceEditor
                        line={line}
                        menuItems={menuItems}
                        translate={translate}
                        formatOrderPrice={formatOrderPrice}
                        onApply={(mode, value) => applySubmittedPriceEdit(line.lineId, mode, value)}
                        onReset={() => resetSubmittedLinePrice(line.lineId)}
                        onCancel={() => setSubmittedPriceEditLineId(null)}
                      />
                    </div>
                  )}
                </li>
              );
            })}

            {cart.map((line) => {
              const lineLabel = line.name.includes("·")
                ? line.name
                : cartLineDisplayName(line, menuItems, language);
              const presetText = (line.specialRequestIds ?? [])
                .map((id) => {
                  const preset = notePresets.find((entry) => entry.id === id);
                  return preset ? presetLabel(preset, language) : null;
                })
                .filter(Boolean)
                .join(", ");
              const noteTextParts = [presetText, line.note].filter(Boolean);
              const noteText =
                line.noteTranslated && noteTextParts.length > 0
                  ? `${line.noteTranslated}${line.note ? ` · ${line.note}` : ""}`
                  : noteTextParts.join(", ");

              return (
                <li
                  key={line.lineId}
                  className="overflow-hidden rounded-xl border border-blue-200 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/30"
                >
                  <div className="flex items-start gap-2 px-3 py-3">
                    <span className="mt-1 h-5 w-5 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => openNoteModal(line)}
                        className="text-left text-base font-semibold leading-snug text-gray-900 hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400"
                      >
                        {line.quantity}× {lineLabel}
                      </button>
                      {noteText && (
                        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{noteText}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">
                        {formatOrderPrice(line.price * line.quantity)}
                      </span>
                      <div className="inline-flex items-center overflow-hidden rounded-md border border-gray-200 dark:border-gray-600">
                        <button
                          type="button"
                          onClick={() => updateCartQty(line.lineId, -1)}
                          className="flex h-8 w-8 items-center justify-center text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                          aria-label={`Decrease ${lineLabel}`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="flex h-8 min-w-[1.75rem] items-center justify-center border-x border-gray-200 px-1 text-sm font-semibold tabular-nums dark:border-gray-600">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(line.lineId, 1)}
                          className="flex h-8 w-8 items-center justify-center text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                          aria-label={`Increase ${lineLabel}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}

            {pendingKitchenMessage && (
              <li className="overflow-hidden rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40">
                <div className="flex items-start gap-2 px-3 py-3">
                  <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-orange-700 dark:text-orange-300" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-orange-800 dark:text-orange-200">
                      {translate("kitchenMessagePendingLabel")}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-orange-950 dark:text-orange-100">
                      {pendingKitchenMessage.messageZh}
                    </p>
                    {pendingKitchenMessage.messageZh.toLowerCase() !==
                      pendingKitchenMessage.message.toLowerCase() && (
                      <p className="mt-0.5 text-xs text-orange-800/80 dark:text-orange-200/80">
                        {pendingKitchenMessage.message}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-orange-700 dark:text-orange-300">
                      {translate("kitchenMessageQueuedHint")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingKitchenMessage(null)}
                    className="shrink-0 rounded-lg p-1.5 text-orange-700 hover:bg-orange-100 dark:text-orange-300 dark:hover:bg-orange-900/50"
                    aria-label={translate("cancel")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 p-3 dark:border-gray-700">
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {translate("total")}
          </span>
          <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {formatOrderPrice(billTotal)}
          </span>
        </div>

        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => openKitchenMessageModal("table")}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200"
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            {translate("kitchenMessageTable")}
          </button>
          <button
            type="button"
            onClick={() => openKitchenMessageModal("general")}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200"
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            {translate("kitchenMessageGeneral")}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={!canSaveNoPrint}
            onClick={() => void handleSaveNoPrint()}
            className="min-h-[52px] rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm font-semibold text-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            {isBusy ? "…" : translate("saveNoPrint")}
          </button>
          <button
            type="button"
            disabled={!hasPendingSend || isBusy}
            onClick={() => void handleSend()}
            className="min-h-[52px] rounded-lg bg-blue-600 px-2 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isBusy ? "…" : translate("sendToKitchen")}
          </button>
          {onCheckout ? (
            <button
              type="button"
              disabled={!canCheckout || isBusy}
              onClick={() => void onCheckout(submittedOrdersRaw)}
              className="min-h-[52px] rounded-lg bg-emerald-600 px-2 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {translate("payButton")}
            </button>
          ) : (
            <span />
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      <ModalOverlay
        open={open}
        className="flex flex-col sm:items-center sm:justify-center sm:p-4"
        backdropClassName="bg-black/65"
        ariaLabelledBy="pos-order-title"
        lockScroll
      >
        <ModalPanel className="flex h-[100dvh] max-h-[100dvh] w-full max-w-[1400px] flex-col overflow-hidden rounded-none border border-gray-200 bg-white shadow-2xl sm:h-[min(94vh,920px)] sm:max-h-[min(94vh,920px)] sm:rounded-2xl dark:border-gray-700 dark:bg-gray-900">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-5 sm:py-4">
            <div>
              <h2
                id="pos-order-title"
                className="text-lg font-semibold text-gray-900 dark:text-gray-100"
              >
                {modalTitle}
              </h2>
              {tableOccupiedSince ? (
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>{translate("tableOccupiedSince")}</span>
                  <ElapsedTimer
                    start={tableOccupiedSince}
                    className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-gray-800 dark:bg-gray-800 dark:text-gray-100"
                  />
                </p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {translate("orderTapHint")}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

        <div
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row"
          onClickCapture={(event) => {
            if (!hasSubmittedChanges || discardConfirmOpen) return;
            const panel = orderPanelRef.current;
            if (!panel || panel.contains(event.target as Node)) return;
            event.stopPropagation();
            openUnsavedConfirm("outside");
          }}
        >
          <aside className="hidden w-36 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-950/50 md:flex sm:w-44 lg:w-52">
            <p className="px-3 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Categories
            </p>
            <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
              <button
                type="button"
                onClick={() => setActiveCategory("__all__")}
                className={`min-h-[44px] w-full text-left ${filterButtonClass(activeCategory === "__all__")}`}
              >
                {translate("allCategories")}
              </button>
              {categoryOptions.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  className={`min-h-[44px] w-full text-left ${filterButtonClass(activeCategory === category.id)}`}
                >
                  {category.name}
                </button>
              ))}
            </nav>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:max-w-[58%]">
            <div className="shrink-0 border-b border-gray-200 md:hidden dark:border-gray-700">
              <div className="flex gap-2 overflow-x-auto px-3 py-2 no-scrollbar">
                <button
                  type="button"
                  onClick={() => setActiveCategory("__all__")}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${filterButtonClass(activeCategory === "__all__")}`}
                >
                  {translate("allCategories")}
                </button>
                {categoryOptions.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${filterButtonClass(activeCategory === category.id)}`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-gray-200 px-3 py-3 dark:border-gray-700 sm:px-4">
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onFocus={() => setSearchKeyboardOpen(true)}
                      onClick={() => setSearchKeyboardOpen(true)}
                      inputMode="none"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={translate("searchMenu")}
                      className="min-h-[48px] w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-base outline-none focus:ring-2 focus:ring-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomItemError(null);
                      setCustomItemRoute("none");
                      setCustomItemType("food");
                      setCustomItemTaxGroup("B");
                      setCustomItemOpen(true);
                    }}
                    className="inline-flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                  >
                    <Plus className="h-4 w-4" />
                    {translate("customItem")}
                  </button>
                </div>
              </div>

              <div
                className={`order-3 min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 md:order-3 md:pb-4 ${
                  searchKeyboardOpen ? "pb-[15.5rem] md:pb-4" : "pb-24 md:pb-4"
                }`}
              >
                {filteredItems.length === 0 ? (
                  <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    {translate("noSearchResults")}
                  </div>
                ) : (
                  <div
                    className={
                      menuItemLayout === "horizontal"
                        ? "flex flex-col gap-1.5"
                        : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4"
                    }
                  >
                    {filteredItems.map((item) => {
                      const inCartQty = cartQtyByMenuId.get(item.id) ?? 0;
                      const station = item.station ?? resolveStation(item.category, item.itemType);
                      const label = menuItemDisplayName(item, language);

                      return (
                        <MenuOrderItemButton
                          key={item.id}
                          item={item}
                          label={label}
                          inCartQty={inCartQty}
                          station={station}
                          layout={menuItemLayout}
                          showMenuPrices={showMenuPrices}
                          formatOrderPrice={formatOrderPrice}
                          soldOutLabel={translate("soldOut")}
                          onAdd={() => quickAdd(item)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {searchKeyboardOpen && (
                <div className="order-2 pointer-events-none absolute inset-x-0 bottom-14 z-20 md:pointer-events-auto md:static md:bottom-auto md:z-auto md:shrink-0">
                  <div className="pointer-events-auto shadow-[0_-8px_24px_rgba(0,0,0,0.12)] md:shadow-none">
                    <OnScreenKeyboard
                      value={search}
                      onChange={setSearch}
                      onHide={() => setSearchKeyboardOpen(false)}
                    />
                  </div>
                </div>
              )}
            </main>
          </div>

          <aside className="hidden w-[42%] min-w-[300px] max-w-xl shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 md:flex md:min-h-0 lg:min-w-[340px]">
            <div ref={orderPanelRef} className="flex min-h-0 flex-1 flex-col">
              {renderCartPanel(false)}
            </div>
          </aside>

          {cartOpen && (
            <div
              ref={orderPanelRef}
              className="fixed inset-0 z-40 flex min-h-0 flex-col bg-white dark:bg-gray-900 md:hidden"
            >
              {renderCartPanel(true)}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="pos-mobile-sticky-bar fixed bottom-0 left-0 right-0 z-30 flex min-h-[56px] items-center justify-between border-t border-gray-200 bg-gray-900 px-4 py-3 text-left text-white shadow-lg md:hidden dark:border-gray-700 dark:bg-gray-100 dark:text-gray-900"
        >
          <span className="text-sm font-medium">
            {translate("cart")} ({cartCount} {cartCount === 1 ? "item" : "items"}) · {formatOrderPrice(cartTotal)}
          </span>
          <ChevronRight className="h-5 w-5 shrink-0" />
        </button>
        </ModalPanel>
      </ModalOverlay>

      {noteLine && (
        <div className="relative z-[60]">
          <Modal
            open
            onClose={closeNoteModal}
            title={translate("specialRequests")}
            footer={
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeNoteModal}
                  className="min-h-[44px] flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold dark:border-gray-700"
                >
                  {translate("cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveNote()}
                  className="min-h-[44px] flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
                >
                  {translate("saveNote")}
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {cartLineDisplayName(noteLine, menuItems, language)}
              </p>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {translate("specialRequests")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {noteLinePresets.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {translate("noSpecialRequestsForItem")}
                    </p>
                  ) : (
                    noteLinePresets.map((preset) => {
                      const active = notePresetIds.includes(preset.id);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            if (!active) setNoteTranslateEnabled(true);
                            setNotePresetIds((prev) => togglePresetId(prev, preset.id));
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                            active
                              ? "bg-emerald-600 text-white"
                              : "border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                          }`}
                        >
                          {presetLabel(preset, language)}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {translate("internalNote")}
                </span>
                <textarea
                  rows={3}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder={translate("notePlaceholder")}
                  className="mt-2 min-h-[96px] w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                {(notePresetIds.length > 0 || noteDraft.trim()) && (
                  <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
                    <input
                      type="checkbox"
                      checked={noteTranslateEnabled}
                      onChange={(event) => setNoteTranslateEnabled(event.target.checked)}
                      className="h-5 w-5 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-800 dark:text-gray-200">
                      {translate("translateToChinese")}
                    </span>
                  </label>
                )}
                {noteTranslateEnabled && (notePresetIds.length > 0 || noteDraft.trim()) && (
                  <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900 dark:bg-orange-950/40">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                      {translate("kitchenMessagePreview")}
                    </p>
                    <p className="mt-1 text-sm font-bold text-orange-700 dark:text-orange-300">
                      {noteTranslating && !noteDraftTranslated
                        ? translate("noteTranslating")
                        : [
                            ...notePresetIds
                              .map((id) => notePresets.find((entry) => entry.id === id)?.labelZh)
                              .filter(Boolean),
                            noteDraftTranslated || noteDraft.trim(),
                          ]
                            .filter(Boolean)
                            .join(", ")}
                    </p>
                  </div>
                )}
              </label>

              <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
                <input
                  type="checkbox"
                  checked={notePrintOnReceipt}
                  onChange={(e) => setNotePrintOnReceipt(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300"
                />
                <span className="text-base text-gray-800 dark:text-gray-200">
                  {translate("printOnReceipt")}
                </span>
              </label>
            </div>
          </Modal>
        </div>
      )}

      {submittedNoteLine && (
        <div className="relative z-[60]">
          <Modal
            open
            onClose={closeSubmittedNoteModal}
            title={translate("specialRequests")}
            footer={
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeSubmittedNoteModal}
                  className="min-h-[44px] flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold dark:border-gray-700"
                >
                  {translate("cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveSubmittedNote()}
                  className="min-h-[44px] flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
                >
                  {translate("saveNote")}
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {orderItemDisplayName(submittedNoteLine, menuItems, language)}
              </p>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {translate("specialRequests")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {submittedNoteLinePresets.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {translate("noSpecialRequestsForItem")}
                    </p>
                  ) : (
                    submittedNoteLinePresets.map((preset) => {
                      const active = submittedNotePresetIds.includes(preset.id);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            if (!active) setSubmittedNoteTranslateEnabled(true);
                            setSubmittedNotePresetIds((prev) =>
                              togglePresetId(prev, preset.id),
                            );
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                            active
                              ? "bg-emerald-600 text-white"
                              : "border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                          }`}
                        >
                          {presetLabel(preset, language)}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {translate("internalNote")}
                </span>
                <textarea
                  rows={3}
                  value={submittedNoteDraft}
                  onChange={(e) => setSubmittedNoteDraft(e.target.value)}
                  placeholder={translate("notePlaceholder")}
                  className="mt-2 min-h-[96px] w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                {(submittedNotePresetIds.length > 0 || submittedNoteDraft.trim()) && (
                  <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
                    <input
                      type="checkbox"
                      checked={submittedNoteTranslateEnabled}
                      onChange={(event) =>
                        setSubmittedNoteTranslateEnabled(event.target.checked)
                      }
                      className="h-5 w-5 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-800 dark:text-gray-200">
                      {translate("translateToChinese")}
                    </span>
                  </label>
                )}
                {submittedNoteTranslateEnabled &&
                  (submittedNotePresetIds.length > 0 || submittedNoteDraft.trim()) && (
                    <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900 dark:bg-orange-950/40">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                        {translate("kitchenMessagePreview")}
                      </p>
                      <p className="mt-1 text-sm font-bold text-orange-700 dark:text-orange-300">
                        {submittedNoteTranslating && !submittedNoteDraftTranslated
                          ? translate("noteTranslating")
                          : [
                              ...submittedNotePresetIds
                                .map((id) => notePresets.find((entry) => entry.id === id)?.labelZh)
                                .filter(Boolean),
                              submittedNoteDraftTranslated || submittedNoteDraft.trim(),
                            ]
                              .filter(Boolean)
                              .join(", ")}
                      </p>
                    </div>
                  )}
              </label>
            </div>
          </Modal>
        </div>
      )}

      <CancelReasonModal
        open={submittedCancelTarget !== null}
        itemCount={submittedCancelTarget?.itemIds.length ?? 0}
        translate={translate}
        onClose={() => setSubmittedCancelTarget(null)}
        onConfirm={handleSubmittedCancelConfirm}
      />

      {customizeItem && (
        <ItemCustomizeModal
          open
          item={customizeItem}
          onClose={() => setCustomizeItem(null)}
          onConfirm={(result) => void handleCustomizeConfirm(result)}
        />
      )}

      {kitchenMessageOpen && (
        <ModalOverlay
          open={kitchenMessageOpen}
          onClose={() => {
            if (!kitchenMessageBusy) setKitchenMessageOpen(false);
          }}
          zIndexClass="z-[60]"
          className="flex items-end justify-center sm:items-center sm:p-4"
          backdropClassName="bg-black/50"
          ariaLabelledBy="kitchen-message-title"
        >
          <ModalPanel className="w-full max-w-lg rounded-t-2xl border border-gray-200 bg-white p-4 shadow-xl sm:rounded-2xl dark:border-gray-700 dark:bg-gray-900 sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3
                  id="kitchen-message-title"
                  className="text-lg font-semibold text-gray-900 dark:text-gray-100"
                >
                  {translate(
                    kitchenMessageMode === "general"
                      ? "kitchenGeneralMessageTitle"
                      : "kitchenMessageTitle",
                  )}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {kitchenMessageMode === "general"
                    ? translate("kitchenGeneralMessageHint")
                    : `${translate("table")} ${tableLabel} · ${translate("kitchenMessageQueuedHint")}`}
                </p>
              </div>
              <button
                type="button"
                disabled={kitchenMessageBusy}
                onClick={() => setKitchenMessageOpen(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <textarea
              rows={4}
              value={kitchenMessageDraft}
              onChange={(event) => setKitchenMessageDraft(event.target.value)}
              placeholder={translate("kitchenMessagePlaceholder")}
              disabled={kitchenMessageBusy}
              className="min-h-[120px] w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              autoFocus
            />

            {kitchenMessageDraft.trim() && (
              <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
                <input
                  type="checkbox"
                  checked={kitchenMessageTranslateEnabled}
                  onChange={(event) => setKitchenMessageTranslateEnabled(event.target.checked)}
                  className="h-5 w-5 rounded border-gray-300"
                />
                <span className="text-sm text-gray-800 dark:text-gray-200">
                  {translate("translateToChinese")}
                </span>
              </label>
            )}

            {kitchenMessageTranslateEnabled && kitchenMessageDraft.trim() && (
              <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900 dark:bg-orange-950/40">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                  {translate("kitchenMessagePreview")}
                </p>
                <p className="mt-1 text-sm font-bold text-orange-700 dark:text-orange-300">
                  {kitchenMessageTranslating && !kitchenMessageTranslated
                    ? translate("noteTranslating")
                    : kitchenMessageTranslated || kitchenMessageDraft.trim()}
                </p>
              </div>
            )}

            {kitchenMessageError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{kitchenMessageError}</p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={kitchenMessageBusy}
                onClick={() => setKitchenMessageOpen(false)}
                className="min-h-[48px] flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold dark:border-gray-700"
              >
                {translate("cancel")}
              </button>
              <button
                type="button"
                disabled={kitchenMessageBusy || !kitchenMessageDraft.trim()}
                onClick={() => void handleKitchenMessageSubmit()}
                className="min-h-[48px] flex-1 rounded-xl bg-orange-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {kitchenMessageBusy
                  ? kitchenMessageMode === "general"
                    ? kitchenMessageTranslateEnabled
                      ? translate("kitchenMessageSending")
                      : translate("kitchenMessagePrinting")
                    : translate("kitchenMessageSaving")
                  : kitchenMessageMode === "general"
                    ? translate("kitchenMessageSendNow")
                    : translate("kitchenMessageSave")}
              </button>
            </div>
          </ModalPanel>
        </ModalOverlay>
      )}

      {customItemOpen && (
        <div className="relative z-[60]">
          <Modal
            open
            onClose={() => setCustomItemOpen(false)}
            title={translate("customItemTitle")}
            footer={
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCustomItemOpen(false)}
                  className="min-h-[44px] flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold dark:border-gray-700"
                >
                  {translate("cancel")}
                </button>
                <button
                  type="button"
                  onClick={addCustomItemToCart}
                  className="min-h-[44px] flex-1 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
                >
                  {translate("addToCart")}
                </button>
              </div>
            }
          >
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {translate("customItemHint")}
              </p>
              {customItemError && (
                <p className="text-sm text-red-600 dark:text-red-400">{customItemError}</p>
              )}
              <label className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("customItemName")}</span>
                <input
                  value={customItemName}
                  onChange={(event) => setCustomItemName(event.target.value)}
                  className="pos-input mt-1"
                  placeholder={translate("customItemNamePlaceholder")}
                  autoFocus
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{translate("customItemPrice")}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={customItemPrice}
                    onChange={(event) => setCustomItemPrice(event.target.value)}
                    className="pos-input mt-1"
                    placeholder="0"
                    inputMode="decimal"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{translate("customItemQty")}</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={customItemQty}
                    onChange={(event) => setCustomItemQty(event.target.value)}
                    className="pos-input mt-1"
                    inputMode="numeric"
                  />
                </label>
              </div>
              <div className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("menuItemRoute")}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ["kitchen", "menuItemRouteKitchen"],
                      ["bar", "menuItemRouteBar"],
                      ["none", "menuItemRouteNone"],
                    ] as const
                  ).map(([value, labelKey]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCustomItemRoute(value)}
                      className={`min-h-[40px] flex-1 rounded-lg px-3 text-sm font-semibold ${filterButtonClass(
                        customItemRoute === value,
                      )}`}
                    >
                      {translate(labelKey)}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  {translate(
                    customItemRoute === "none" ? "menuItemRouteNoneHint" : "menuItemRouteHint",
                  )}
                </p>
              </div>
              <div className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("customItemType")}</span>
                <div className="mt-2 flex gap-2">
                  {(
                    [
                      ["food", "summaryFood"],
                      ["drink", "summaryDrinks"],
                    ] as const
                  ).map(([value, labelKey]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setCustomItemType(value);
                        setCustomItemTaxGroup(defaultTaxGroupForItemType(value));
                      }}
                      className={`min-h-[40px] flex-1 rounded-lg px-3 text-sm font-semibold ${filterButtonClass(
                        customItemType === value,
                      )}`}
                    >
                      {translate(labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="block text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("menuItemTaxGroup")}</span>
                <div className="mt-2 flex gap-2">
                  {(
                    [
                      ["B", "menuItemTaxFood"],
                      ["A", "menuItemTaxDrink"],
                    ] as const
                  ).map(([value, labelKey]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCustomItemTaxGroup(value)}
                      className={`min-h-[40px] flex-1 rounded-lg px-3 text-sm font-semibold ${filterButtonClass(
                        customItemTaxGroup === value,
                      )}`}
                    >
                      {translate(labelKey)}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  {translate("menuItemTaxHint")} {taxRateForGroup(customItemTaxGroup)}%
                </p>
              </div>
            </div>
          </Modal>
        </div>
      )}

      <GrillGuestCountModal
        open={grillGuestModalOpen}
        itemLabel={
          pendingGrillItem ? menuItemDisplayName(pendingGrillItem, language) : undefined
        }
        translate={translate}
        onConfirm={(count) => void handleGrillGuestConfirm(count)}
        onClose={handleGrillGuestClose}
      />

      {discardConfirmOpen && (
        <ModalOverlay
          open={discardConfirmOpen}
          onClose={() => {
            setDiscardConfirmOpen(false);
            setUnsavedConfirmMode(null);
          }}
          zIndexClass="z-[60]"
          className="flex items-center justify-center p-4"
          backdropClassName="bg-black/50"
          role="alertdialog"
          ariaLabelledBy="unsaved-changes-title"
        >
          <ModalPanel className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <p
              id="unsaved-changes-title"
              className="text-sm leading-relaxed text-gray-800 dark:text-gray-100"
            >
              {hasSubmittedChanges
                ? translate("unsavedChangesTitle")
                : translate("discardCartTitle")}
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              {hasSubmittedChanges && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleUnsavedSave()}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {translate("unsavedChangesSave")}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDiscardConfirmOpen(false);
                  setUnsavedConfirmMode(null);
                }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                {translate("discardStay")}
              </button>
              <button
                type="button"
                onClick={handleUnsavedDiscard}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white"
              >
                {hasSubmittedChanges
                  ? translate("unsavedChangesDiscard")
                  : translate("discardLeave")}
              </button>
            </div>
          </ModalPanel>
        </ModalOverlay>
      )}
    </>
  );
}
