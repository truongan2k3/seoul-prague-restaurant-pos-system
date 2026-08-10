"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Minus, Plus, Search, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { categoriesForOrdering } from "@/lib/category-utils";
import { formatPosPrice, priceDisplayOptionsFromSettings } from "@/lib/price-display";
import {
  cartLineDisplayName,
  menuItemDisplayName,
} from "@/lib/menu-display";
import {
  buildCustomizationSignature,
  hasCustomization,
  mergeNoteWithKitchenModifiers,
} from "@/lib/menu-customization";
import { finalizeNoteTranslation, presetLabel, togglePresetId } from "@/lib/note-presets";
import { resolveOrderLineStation, resolveStation } from "@/lib/order-routing";
import type { LanguageCode, MenuCategoryRecord, MenuItem, MenuItemLayout, NotePreset, OrderItem, SelectedMenuOption, Station } from "@/lib/types";
import { filterButtonClass } from "@/lib/theme-classes";
import { ItemCustomizeModal, type CustomizeResult } from "@/components/item-customize-modal";
import { GrillGuestCountModal } from "@/components/grill-guest-count-modal";
import { OnScreenKeyboard } from "@/components/on-screen-keyboard";
import {
  buildGrillGuestPrepOrder,
  cartHasGrillItems,
  shouldPromptGrillGuestCount,
} from "@/lib/grill-guest-count";
import {
  fetchNotePresets,
  mapNotePresetsResponse,
} from "@/src/lib/note-preset-actions";
import { translateNoteToChinese } from "@/src/lib/translator";

interface CartLine {
  lineId: string;
  menuItemId: string;
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
  freeAddOnSelected?: boolean;
  kitchenModifierText?: string;
  specialRequestIds?: string[];
  isFreeAddOnLine?: boolean;
}

interface NewOrderModalProps {
  open: boolean;
  tableLabel: string;
  menuItems: MenuItem[];
  categories?: MenuCategoryRecord[];
  mode?: "new" | "append";
  existingOrders?: OrderItem[];
  onClose: () => void;
  onSendToKitchen: (orders: OrderItem[]) => void | Promise<void>;
  isSaving?: boolean;
}

function cartLinesToOrders(lines: CartLine[]): OrderItem[] {
  return lines.map((line) => {
    const merged = mergeNoteWithKitchenModifiers(
      line.note.trim() || undefined,
      line.noteTranslated,
      line.kitchenModifierText ?? "",
    );
    return {
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
      modifiers: {
        selectedOptions: line.selectedOptions,
        freeAddOnSelected: line.freeAddOnSelected,
        specialRequestIds: line.specialRequestIds,
      },
    };
  });
}

function newLineId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function findDefaultLine(cart: CartLine[], menuItemId: string, signature?: string) {
  return cart.find(
    (line) =>
      line.menuItemId === menuItemId &&
      line.note === "" &&
      !line.isPrintedNote &&
      !line.isFreeAddOnLine &&
      (signature ? line.customizationSignature === signature : !line.customizationSignature),
  );
}

function buildFreeAddOnLine(item: MenuItem, language: LanguageCode): CartLine | null {
  const addOn = item.customizationConfig?.freeAddOn;
  if (!addOn) return null;
  const label =
    language === "cs"
      ? addOn.nameCz
      : language === "zh"
        ? addOn.nameZh
        : addOn.nameEn;
  return {
    lineId: newLineId(),
    menuItemId: item.id,
    name: `${label} (${language === "cs" ? "zdarma" : language === "zh" ? "免费" : "free"})`,
    price: 0,
    quantity: 1,
    category: item.category,
    itemType: item.itemType,
    station: item.station,
    note: "",
    isPrintedNote: false,
    imageUrl: item.imageUrl,
    isFreeAddOnLine: true,
    kitchenModifierText: addOn.nameZh.trim() || addOn.nameEn,
  };
}

function MenuItemImage({ item, label }: { item: MenuItem; label: string }) {
  if (item.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.imageUrl} alt={label} className="h-full w-full object-cover" />
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
        className={`flex w-full min-h-[52px] flex-row items-center gap-2.5 rounded-lg border px-2 py-1.5 ${buttonClass}`}
      >
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
          <MenuItemImage item={item} label={label} />
          {qtyBadge}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {label}
            {unavailable && (
              <span className="ml-2 text-xs font-semibold text-red-500">({soldOutLabel})</span>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2 text-right">
            {showMenuPrices && (
              <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatOrderPrice(item.price)}
              </p>
            )}
            <p className="hidden text-[10px] text-gray-400 sm:block">{station}</p>
          </div>
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
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
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
  menuItems,
  categories = [],
  mode = "new",
  existingOrders = [],
  onClose,
  onSendToKitchen,
  isSaving = false,
}: NewOrderModalProps) {
  const { translate, language } = useApp();
  const { settings } = useSettings();
  const priceOptions = priceDisplayOptionsFromSettings(settings);
  const formatOrderPrice = (amount: number) => formatPosPrice(amount, priceOptions);
  const showMenuPrices = settings.showPricesOnOrderScreen;
  const menuItemLayout = settings.menuItemLayout;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [searchKeyboardOpen, setSearchKeyboardOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("__all__");
  const [cartOpen, setCartOpen] = useState(false);
  const [noteLineId, setNoteLineId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteDraftTranslated, setNoteDraftTranslated] = useState("");
  const [noteTranslating, setNoteTranslating] = useState(false);
  const [notePrintOnReceipt, setNotePrintOnReceipt] = useState(false);
  const [notePresetIds, setNotePresetIds] = useState<string[]>([]);
  const [notePresets, setNotePresets] = useState<NotePreset[]>([]);
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [grillGuestCount, setGrillGuestCount] = useState<number | null>(null);
  const [grillGuestModalOpen, setGrillGuestModalOpen] = useState(false);
  const [pendingGrillItem, setPendingGrillItem] = useState<MenuItem | null>(null);
  const [pendingCustomizeResult, setPendingCustomizeResult] = useState<CustomizeResult | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const note = noteDraft.trim();
    if (!note) {
      setNoteDraftTranslated("");
      setNoteTranslating(false);
      return;
    }

    setNoteTranslating(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void translateNoteToChinese(note).then((translated) => {
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
  }, [noteDraft]);

  const categoryOptions = useMemo(() => categoriesForOrdering(categories), [categories]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      const matchesCategory =
        activeCategory === "__all__" ||
        item.categoryId === activeCategory ||
        item.category === activeCategory ||
        categoryOptions.find((c) => c.id === activeCategory)?.name === item.category;
      const label = menuItemDisplayName(item, language);
      const matchesSearch =
        !query ||
        label.toLowerCase().includes(query) ||
        item.nameEn.toLowerCase().includes(query) ||
        item.nameCz.toLowerCase().includes(query) ||
        item.nameZh.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [menuItems, activeCategory, search, language, categoryOptions]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);

  const cartQtyByMenuId = useMemo(() => {
    const totals = new Map<string, number>();
    for (const line of cart) {
      totals.set(line.menuItemId, (totals.get(line.menuItemId) ?? 0) + line.quantity);
    }
    return totals;
  }, [cart]);

  const noteLine = noteLineId ? cart.find((line) => line.lineId === noteLineId) : undefined;

  const modalTitle =
    mode === "append"
      ? `${translate("addMoreItems")} — ${translate("table")} ${tableLabel}`
      : `${translate("newOrder")} — ${translate("table")} ${tableLabel}`;

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
        },
      ];
    });
  };

  const applyCustomizeResult = async (item: MenuItem, result: CustomizeResult) => {
    const signature = buildCustomizationSignature(
      item.id,
      result.selections,
      result.freeAddOnSelected,
    );

    let itemNoteTranslated = "";
    if (result.itemNote) {
      itemNoteTranslated = await translateNoteToChinese(result.itemNote);
    }

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
      freeAddOnSelected: result.freeAddOnSelected,
      kitchenModifierText: result.kitchenModifierText,
    };

    setCart((prev) => {
      const existing = findDefaultLine(prev, item.id, signature);
      const next = existing
        ? prev.map((line) =>
            line.lineId === existing.lineId
              ? { ...line, quantity: line.quantity + 1 }
              : line,
          )
        : [...prev, mainLine];

      if (!result.freeAddOnSelected) return next;

      const freeLine = buildFreeAddOnLine(item, language);
      if (!freeLine) return next;

      const existingFree = next.find(
        (line) => line.isFreeAddOnLine && line.menuItemId === item.id,
      );
      if (existingFree) {
        return next.map((line) =>
          line.lineId === existingFree.lineId
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [...next, freeLine];
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
    setNotePresetIds(line.specialRequestIds ?? []);
    setNoteTranslating(false);
    setNotePrintOnReceipt(line.isPrintedNote);
  };

  const closeNoteModal = () => {
    setNoteLineId(null);
    setNoteDraft("");
    setNoteDraftTranslated("");
    setNotePresetIds([]);
    setNoteTranslating(false);
    setNotePrintOnReceipt(false);
  };

  const handleSaveNote = async () => {
    if (!noteLineId) return;
    const trimmed = noteDraft.trim();
    let translated = "";
    if (trimmed) {
      translated = await translateNoteToChinese(trimmed);
    }

    setCart((prev) =>
      prev.map((line) =>
        line.lineId === noteLineId
          ? {
              ...line,
              note: trimmed,
              noteTranslated: translated || undefined,
              isPrintedNote: notePrintOnReceipt,
              specialRequestIds: notePresetIds,
              customizationSignature: line.customizationSignature
                ? `${line.customizationSignature}|sr:${notePresetIds.join(",")}|n:${trimmed}`
                : `sr:${notePresetIds.join(",")}|n:${trimmed}`,
            }
          : line,
      ),
    );
    closeNoteModal();
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

  const handleSend = async () => {
    if (cart.length === 0 || isSaving) return;
    const orders: OrderItem[] = await Promise.all(
      cart.map(async (line) => {
        const { note, noteTranslated } = await finalizeNoteTranslation(
          notePresets,
          line.specialRequestIds ?? [],
          line.note,
          language,
        );
        const merged = mergeNoteWithKitchenModifiers(
          note,
          noteTranslated,
          line.kitchenModifierText ?? "",
        );
        return {
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
          modifiers: {
            selectedOptions: line.selectedOptions,
            freeAddOnSelected: line.freeAddOnSelected,
            specialRequestIds: line.specialRequestIds,
          },
        };
      }),
    );

    if (grillGuestCount !== null && cartHasGrillItems(cart)) {
      orders.unshift(buildGrillGuestPrepOrder(grillGuestCount));
    }

    await onSendToKitchen(orders);
    setCart([]);
    setCartOpen(false);
    setGrillGuestCount(null);
  };

  const handleClose = () => {
    setDiscardConfirmOpen(false);
    setCart([]);
    onClose();
  };

  const requestClose = () => {
    if (cart.length > 0) {
      setDiscardConfirmOpen(true);
      return;
    }
    handleClose();
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || noteLineId) return;
      if (discardConfirmOpen) {
        setDiscardConfirmOpen(false);
        return;
      }
      requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, noteLineId, discardConfirmOpen, cart.length, onClose]);

  const renderCartPanel = (showCloseButton: boolean) => (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-4 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {translate("cart")}
        </h3>
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

      <div className="flex-1 overflow-y-auto p-4">
        {cart.length === 0 ? (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">Cart is empty</p>
        ) : (
          <ul className="space-y-3">
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
                  className="rounded-xl border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div className="flex gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                      {line.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={line.imageUrl}
                          alt={lineLabel}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
                          {lineLabel.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => openNoteModal(line)}
                        className="cursor-pointer text-left text-sm font-semibold text-gray-900 hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400"
                      >
                        {lineLabel}
                      </button>
                      {(noteTextParts.length > 0 || line.noteTranslated) && (
                        <p className="mt-1 text-xs italic text-gray-500 dark:text-gray-400">
                          {translate("specialRequests")}: {noteText}
                        </p>
                      )}
                      {line.isPrintedNote && (
                        <p className="mt-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                          {translate("printOnReceipt")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                        {formatOrderPrice(line.price * line.quantity)}
                      </span>
                      <div className="inline-flex items-center overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600">
                        <button
                          type="button"
                          onClick={() => updateCartQty(line.lineId, -1)}
                          className="touch-target flex h-8 w-8 items-center justify-center text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                          aria-label={`Decrease ${lineLabel}`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="flex h-8 min-w-[2rem] items-center justify-center border-x border-gray-200 px-1 text-sm font-semibold tabular-nums dark:border-gray-600">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(line.lineId, 1)}
                          className="touch-target flex h-8 w-8 items-center justify-center text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
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
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 p-4 dark:border-gray-700">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">{translate("total")}</span>
          <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {formatOrderPrice(cartTotal)}
          </span>
        </div>
        <button
          type="button"
          disabled={cart.length === 0 || isSaving}
          onClick={() => void handleSend()}
          className="min-h-[52px] w-full rounded-xl bg-emerald-600 py-3.5 text-base font-semibold text-white disabled:opacity-40"
        >
          {isSaving ? "..." : translate("sendToKitchen")}
        </button>
      </div>
    </>
  );

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-order-title"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-black/65"
        />

        <div className="relative z-10 flex h-[100dvh] max-h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-none border border-gray-200 bg-white shadow-2xl sm:h-[min(94vh,920px)] sm:max-h-[min(94vh,920px)] sm:rounded-2xl dark:border-gray-700 dark:bg-gray-900">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-5 sm:py-4">
            <div>
              <h2
                id="pos-order-title"
                className="text-lg font-semibold text-gray-900 dark:text-gray-100"
              >
                {modalTitle}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {translate("orderTapHint")}
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
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

          <div className="flex min-h-0 min-w-0 flex-1 flex-col md:max-w-[68%]">
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
                <div className="relative">
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
              </div>

              <div
                className={`order-3 min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 md:order-3 md:pb-4 ${
                  searchKeyboardOpen ? "pb-[15.5rem] md:pb-4" : "pb-24 md:pb-4"
                }`}
              >
                {filteredItems.length === 0 ? (
                  <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    No items match your search
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

          <aside className="hidden w-[32%] min-w-[280px] max-w-md shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 md:flex md:min-h-0">
            {renderCartPanel(false)}
          </aside>

          {cartOpen && (
            <div className="fixed inset-0 z-40 flex min-h-0 flex-col bg-white dark:bg-gray-900 md:hidden">
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
      </div>
      </div>

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
                  {notePresets.map((preset) => {
                    const active = notePresetIds.includes(preset.id);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          setNotePresetIds((prev) => togglePresetId(prev, preset.id))
                        }
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "bg-emerald-600 text-white"
                            : "border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                        }`}
                      >
                        {presetLabel(preset, language)}
                      </button>
                    );
                  })}
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
                  <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900 dark:bg-orange-950/40">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                      Kitchen (中文)
                    </p>
                    <p className="mt-1 text-sm font-bold text-orange-700 dark:text-orange-300">
                      {[
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

      {customizeItem && (
        <ItemCustomizeModal
          open
          item={customizeItem}
          onClose={() => setCustomizeItem(null)}
          onConfirm={(result) => void handleCustomizeConfirm(result)}
        />
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div aria-hidden="true" className="absolute inset-0 bg-black/50" />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-cart-title"
            className="relative z-10 w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          >
            <p
              id="discard-cart-title"
              className="text-sm leading-relaxed text-gray-800 dark:text-gray-100"
            >
              Bạn có chắc chắn muốn thoát? Các món chưa lưu sẽ bị xóa.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDiscardConfirmOpen(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white"
              >
                Thoát
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
