"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Minus, Plus, Search, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { categoriesForOrdering } from "@/lib/category-utils";
import { formatPrice } from "@/lib/i18n/translations";
import {
  cartLineDisplayName,
  menuItemDisplayDescription,
  menuItemDisplayName,
} from "@/lib/menu-display";
import { resolveStation } from "@/lib/order-routing";
import type { MenuCategoryRecord, MenuItem, OrderItem } from "@/lib/types";
import { filterButtonClass } from "@/lib/theme-classes";
import { translateNoteToChinese } from "@/src/lib/translator";

interface CartLine {
  lineId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  itemType: MenuItem["itemType"];
  note: string;
  noteTranslated?: string;
  isPrintedNote: boolean;
  imageUrl?: string;
}

interface NewOrderModalProps {
  open: boolean;
  tableLabel: string;
  menuItems: MenuItem[];
  categories?: MenuCategoryRecord[];
  mode?: "new" | "append";
  onClose: () => void;
  onSendToKitchen: (orders: OrderItem[]) => void | Promise<void>;
  isSaving?: boolean;
}

function cartLinesToOrders(lines: CartLine[]): OrderItem[] {
  return lines.map((line) => ({
    menuItemId: line.menuItemId,
    name: line.name,
    price: line.price,
    quantity: line.quantity,
    notes: line.note.trim() || undefined,
    notesTranslated: line.noteTranslated?.trim() || undefined,
    isPrintedNote: line.isPrintedNote,
    station: resolveStation(line.category, line.itemType),
    status: "preparing",
  }));
}

function newLineId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function findDefaultLine(cart: CartLine[], menuItemId: string) {
  return cart.find(
    (line) =>
      line.menuItemId === menuItemId && line.note === "" && !line.isPrintedNote,
  );
}

function findMatchingLine(
  cart: CartLine[],
  menuItemId: string,
  note: string,
  isPrintedNote: boolean,
) {
  return cart.find(
    (line) =>
      line.menuItemId === menuItemId &&
      line.note === note &&
      line.isPrintedNote === isPrintedNote,
  );
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

export function NewOrderModal({
  open,
  tableLabel,
  menuItems,
  categories = [],
  mode = "new",
  onClose,
  onSendToKitchen,
  isSaving = false,
}: NewOrderModalProps) {
  const { translate, language } = useApp();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("__all__");
  const [cartOpen, setCartOpen] = useState(false);
  const [detailsItem, setDetailsItem] = useState<MenuItem | null>(null);
  const [detailsNote, setDetailsNote] = useState("");
  const [detailsNoteTranslated, setDetailsNoteTranslated] = useState("");
  const [detailsTranslating, setDetailsTranslating] = useState(false);
  const [detailsPrint, setDetailsPrint] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCart([]);
    setSearch("");
    setActiveCategory("__all__");
    setCartOpen(false);
    setDetailsItem(null);
    setDetailsNote("");
    setDetailsNoteTranslated("");
    setDetailsTranslating(false);
    setDetailsPrint(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !detailsItem) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, detailsItem]);

  useEffect(() => {
    const note = detailsNote.trim();
    if (!note) {
      setDetailsNoteTranslated("");
      setDetailsTranslating(false);
      return;
    }

    setDetailsTranslating(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void translateNoteToChinese(note).then((translated) => {
        if (!cancelled) {
          setDetailsNoteTranslated(translated);
          setDetailsTranslating(false);
        }
      });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [detailsNote]);

  const categoryOptions = useMemo(() => categoriesForOrdering(categories), [categories]);

  const menuById = useMemo(
    () => new Map(menuItems.map((item) => [item.id, item])),
    [menuItems],
  );

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

  const modalTitle =
    mode === "append"
      ? `${translate("addMoreItems")} — ${translate("table")} ${tableLabel}`
      : `${translate("newOrder")} — ${translate("table")} ${tableLabel}`;

  const getDefaultQty = (menuItemId: string) =>
    findDefaultLine(cart, menuItemId)?.quantity ?? 0;

  const quickAdd = (item: MenuItem) => {
    if (!item.isAvailable) return;
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
          note: "",
          isPrintedNote: false,
          imageUrl: item.imageUrl,
        },
      ];
    });
  };

  const quickRemove = (item: MenuItem) => {
    setCart((prev) => {
      const existing = findDefaultLine(prev, item.id);
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        return prev.filter((line) => line.lineId !== existing.lineId);
      }
      return prev.map((line) =>
        line.lineId === existing.lineId
          ? { ...line, quantity: line.quantity - 1 }
          : line,
      );
    });
  };

  const openItemDetails = (item: MenuItem) => {
    if (!item.isAvailable) return;
    setDetailsItem(item);
    setDetailsNote("");
    setDetailsNoteTranslated("");
    setDetailsTranslating(false);
    setDetailsPrint(false);
  };

  const upsertCustomLine = (
    item: MenuItem,
    note: string,
    isPrintedNote: boolean,
    noteTranslated?: string,
  ) => {
    const label = menuItemDisplayName(item, language);
    setCart((prev) => {
      const existing = findMatchingLine(prev, item.id, note, isPrintedNote);
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
          note,
          noteTranslated: noteTranslated || undefined,
          isPrintedNote,
          imageUrl: item.imageUrl,
        },
      ];
    });
    setCartOpen(true);
  };

  const handleUpdateItem = async () => {
    if (!detailsItem) return;
    const note = detailsNote.trim();
    let noteTranslated = detailsNoteTranslated.trim();
    if (note && !noteTranslated) {
      noteTranslated = await translateNoteToChinese(note);
    }
    upsertCustomLine(detailsItem, note, detailsPrint, noteTranslated || undefined);
    setDetailsItem(null);
    setDetailsNote("");
    setDetailsNoteTranslated("");
    setDetailsTranslating(false);
    setDetailsPrint(false);
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

  const removeCartLine = (lineId: string) => {
    setCart((prev) => prev.filter((line) => line.lineId !== lineId));
  };

  const handleSend = async () => {
    if (cart.length === 0 || isSaving) return;
    const baseOrders = cartLinesToOrders(cart);
    const orders = await Promise.all(
      baseOrders.map(async (order) => {
        const menu = order.menuItemId ? menuById.get(order.menuItemId) : undefined;
        const withName = menu ? { ...order, name: menuItemDisplayName(menu, language) } : order;
        if (withName.notes && !withName.notesTranslated) {
          return {
            ...withName,
            notesTranslated: await translateNoteToChinese(withName.notes),
          };
        }
        return withName;
      }),
    );
    await onSendToKitchen(orders);
    setCart([]);
    setCartOpen(false);
  };

  const handleClose = () => {
    setCart([]);
    onClose();
  };

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
              const lineLabel = cartLineDisplayName(line, menuItems, language);
              return (
                <li
                  key={line.lineId}
                  className="rounded-xl border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div className="flex gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                      {line.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={line.imageUrl}
                          alt={lineLabel}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-400">
                          {lineLabel.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {lineLabel}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatPrice(line.price)} · {resolveStation(line.category, line.itemType)}
                      </p>
                      {line.note && (
                        <p className="mt-1 text-xs italic text-gray-500 dark:text-gray-400">
                          {line.noteTranslated &&
                          line.noteTranslated.toLowerCase() !== line.note.toLowerCase()
                            ? `${line.noteTranslated} · ${line.note}`
                            : line.note}
                        </p>
                      )}
                      {line.isPrintedNote && (
                        <p className="mt-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                          {translate("printOnReceipt")}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCartLine(line.lineId)}
                      className="touch-target flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateCartQty(line.lineId, -1)}
                        className="touch-target flex items-center justify-center rounded-lg border dark:border-gray-600"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-base font-semibold">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(line.lineId, 1)}
                        className="touch-target flex items-center justify-center rounded-lg border dark:border-gray-600"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="text-sm font-semibold">
                      {formatPrice(line.price * line.quantity)}
                    </span>
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
            {formatPrice(cartTotal)}
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
        className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-order-title"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={handleClose}
          className="absolute inset-0 bg-black/65"
        />

        <div className="relative z-10 flex h-[min(94vh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-5 sm:py-4">
            <div>
              <h2
                id="pos-order-title"
                className="text-lg font-semibold text-gray-900 dark:text-gray-100"
              >
                {modalTitle}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Tap +/− for quick add · Tap name or image for options
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

        <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
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

          <div className="flex min-w-0 flex-1 flex-col md:max-w-[68%]">
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

            <main className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-gray-200 px-3 py-3 dark:border-gray-700 sm:px-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={translate("searchMenu")}
                    className="min-h-[48px] w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-base outline-none focus:ring-2 focus:ring-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 pb-24 sm:p-4 md:pb-4">
                {filteredItems.length === 0 ? (
                  <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    No items match your search
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredItems.map((item) => {
                      const defaultQty = getDefaultQty(item.id);
                      const station = resolveStation(item.category, item.itemType);
                      const label = menuItemDisplayName(item, language);

                      return (
                        <article
                          key={item.id}
                          className={`flex flex-col overflow-hidden rounded-xl border bg-white dark:bg-gray-900 ${
                            !item.isAvailable
                              ? "cursor-not-allowed opacity-50"
                              : "border-gray-200 dark:border-gray-700"
                          }`}
                        >
                          <button
                            type="button"
                            disabled={!item.isAvailable}
                            onClick={() => openItemDetails(item)}
                            className="block w-full text-left active:opacity-90"
                          >
                            <div className="aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-gray-800">
                              <MenuItemImage item={item} label={label} />
                            </div>
                            <div className="px-3 pt-3">
                              <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
                                {label}
                              </p>
                              <p className="mt-1 text-[10px] text-gray-400">{station}</p>
                            </div>
                          </button>

                          <div className="mt-auto px-3 pb-3 pt-2">
                            <p className="mb-2 text-center text-base font-bold text-emerald-600 dark:text-emerald-400">
                              {formatPrice(item.price)}
                            </p>
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                disabled={!item.isAvailable || defaultQty === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  quickRemove(item);
                                }}
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-800 transition-colors active:scale-95 disabled:opacity-30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                aria-label={`Remove ${label}`}
                              >
                                <Minus className="h-6 w-6" />
                              </button>
                              <span className="flex h-12 min-w-[3rem] items-center justify-center rounded-xl bg-gray-100 text-lg font-bold tabular-nums text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                                {defaultQty}
                              </span>
                              <button
                                type="button"
                                disabled={!item.isAvailable}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  quickAdd(item);
                                }}
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-emerald-500 bg-emerald-500 text-white transition-colors active:scale-95 disabled:opacity-30"
                                aria-label={`Add ${label}`}
                              >
                                <Plus className="h-6 w-6" />
                              </button>
                            </div>
                            {!item.isAvailable && (
                              <p className="mt-2 text-center text-xs font-semibold text-red-500">
                                {translate("soldOut")}
                              </p>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
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
            {translate("cart")} ({cartCount} {cartCount === 1 ? "item" : "items"}) · {formatPrice(cartTotal)}
          </span>
          <ChevronRight className="h-5 w-5 shrink-0" />
        </button>
      </div>
      </div>

      {detailsItem && (
        <div className="relative z-[60]">
        <Modal
          open
          onClose={() => setDetailsItem(null)}
          title={translate("itemDetails")}
          footer={
            <button
              type="button"
              onClick={() => void handleUpdateItem()}
              className="min-h-[52px] w-full rounded-xl bg-gray-900 py-3.5 text-base font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
            >
              {translate("updateItem")}
            </button>
          }
        >
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
                <MenuItemImage item={detailsItem} label={menuItemDisplayName(detailsItem, language)} />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {menuItemDisplayName(detailsItem, language)}
                </p>
                <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatPrice(detailsItem.price)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {resolveStation(detailsItem.category, detailsItem.itemType)}
                </p>
                {menuItemDisplayDescription(detailsItem, language) && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {menuItemDisplayDescription(detailsItem, language)}
                  </p>
                )}
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {translate("internalNote")}
              </span>
              <textarea
                rows={3}
                value={detailsNote}
                onChange={(e) => setDetailsNote(e.target.value)}
                placeholder='e.g. "no spicy", "no onion"'
                className="mt-2 min-h-[96px] w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              {detailsNote.trim() && (
                <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900 dark:bg-orange-950/40">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                    Kitchen (中文)
                  </p>
                  <p className="mt-1 text-sm font-bold text-orange-700 dark:text-orange-300">
                    {detailsTranslating ? "…" : detailsNoteTranslated || detailsNote.trim()}
                  </p>
                  <input type="hidden" value={detailsNoteTranslated} readOnly aria-hidden />
                </div>
              )}
            </label>

            <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
              <input
                type="checkbox"
                checked={detailsPrint}
                onChange={(e) => setDetailsPrint(e.target.checked)}
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
    </>
  );
}
