"use client";

import { useRef, useState } from "react";
import type {
  WebsiteAmenity,
  WebsiteMenuCategory,
  WebsiteMenuItem,
  WebsiteMenuPdf,
} from "@/lib/website/types";
import { MenuPdfManager } from "@/components/admin/website/menu-pdf-manager";
import {
  deleteWebsiteAmenity,
  upsertWebsiteAmenity,
  upsertWebsiteMenuCategory,
  upsertWebsiteMenuItem,
} from "@/src/lib/website-actions";

function formatPrice(price: number | null, currency: string): string {
  if (price == null) return "Price on request";
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency }).format(price);
}

/** Compact amenities editor for the visual designer inspector. */
export function AmenitiesDesignerPanel({
  amenities,
  onChange,
}: {
  amenities: WebsiteAmenity[];
  onChange: (next: WebsiteAmenity[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const iconRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const add = async () => {
    if (!label.trim()) return;
    const { data, error } = await upsertWebsiteAmenity({
      label: label.trim(),
      icon: "sparkles",
      iconUrl: "",
      sortOrder: amenities.length,
      enabled: true,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data) onChange([...amenities, data]);
    setLabel("");
    setMessage("Amenity added.");
  };

  const uploadIcon = async (row: WebsiteAmenity, file: File) => {
    setBusyId(row.id);
    setMessage(null);
    try {
      if (!file.type.startsWith("image/")) {
        setMessage("Icon must be an image (PNG/SVG).");
        return;
      }
      const { uploadFileDirectToStorage } = await import("@/lib/website/direct-upload");
      const uploaded = await uploadFileDirectToStorage(file, "amenities");
      if (uploaded.error || !uploaded.publicUrl) {
        setMessage(uploaded.error || "Icon upload failed.");
        return;
      }
      const { data, error } = await upsertWebsiteAmenity({
        ...row,
        iconUrl: uploaded.publicUrl,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      if (data) onChange(amenities.map((item) => (item.id === row.id ? data : item)));
      setMessage("Icon saved.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Amenities</p>
      <p className="text-[11px] text-gray-500">Edit here — canvas preview updates live.</p>
      <ul className="max-h-72 space-y-2 overflow-y-auto">
        {amenities.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2 dark:border-gray-700"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
              {row.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.iconUrl} alt="" className="h-8 w-8 object-contain" />
              ) : (
                <span className="text-[10px] text-gray-400">PNG</span>
              )}
            </div>
            <input
              className="pos-input min-w-0 flex-1 !py-1 text-sm"
              value={row.label}
              onChange={(event) =>
                onChange(
                  amenities.map((item) =>
                    item.id === row.id ? { ...item, label: event.target.value } : item,
                  ),
                )
              }
              onBlur={async () => {
                const current = amenities.find((item) => item.id === row.id);
                if (!current) return;
                const { data } = await upsertWebsiteAmenity(current);
                if (data) onChange(amenities.map((item) => (item.id === row.id ? data : item)));
              }}
            />
            <input
              ref={(el) => {
                iconRefs.current[row.id] = el;
              }}
              type="file"
              accept="image/png,image/svg+xml,image/webp,image/jpeg"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadIcon(row, file);
              }}
            />
            <button
              type="button"
              disabled={busyId === row.id}
              className="text-[11px] font-medium text-[#8B6914] disabled:opacity-50"
              onClick={() => iconRefs.current[row.id]?.click()}
            >
              {busyId === row.id ? "…" : "Icon"}
            </button>
            <button
              type="button"
              className="text-[11px] text-gray-500"
              onClick={async () => {
                const { data } = await upsertWebsiteAmenity({ ...row, enabled: !row.enabled });
                if (data) onChange(amenities.map((item) => (item.id === row.id ? data : item)));
              }}
            >
              {row.enabled ? "Hide" : "Show"}
            </button>
            <button
              type="button"
              className="text-[11px] text-red-600"
              onClick={async () => {
                await deleteWebsiteAmenity(row.id);
                onChange(amenities.filter((item) => item.id !== row.id));
              }}
            >
              Del
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className="pos-input flex-1 !py-1 text-sm"
          placeholder="New amenity"
          onKeyDown={(event) => {
            if (event.key === "Enter") void add();
          }}
        />
        <button
          type="button"
          onClick={() => void add()}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white dark:bg-gray-100 dark:text-gray-900"
        >
          Add
        </button>
      </div>
      {message ? <p className="text-[11px] text-gray-500">{message}</p> : null}
    </div>
  );
}

/** Compact menu editor for the visual designer inspector. */
export function MenuDesignerPanel({
  categories,
  items,
  menuPdfs,
  onCategoriesChange,
  onItemsChange,
  onMenuPdfsChange,
}: {
  categories: WebsiteMenuCategory[];
  items: WebsiteMenuItem[];
  menuPdfs: WebsiteMenuPdf[];
  onCategoriesChange: (next: WebsiteMenuCategory[]) => void;
  onItemsChange: (next: WebsiteMenuItem[]) => void;
  onMenuPdfsChange: (next: WebsiteMenuPdf[]) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState("");

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    const slug = newCategory
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const { data, error } = await upsertWebsiteMenuCategory({
      name: newCategory.trim(),
      slug: slug || `cat-${categories.length + 1}`,
      sortOrder: categories.length,
      enabled: true,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data) onCategoriesChange([...categories, data]);
    setNewCategory("");
    setMessage("Category added.");
  };

  const addItem = async () => {
    const categoryId = categories.find((row) => row.enabled)?.id ?? categories[0]?.id ?? "";
    if (!categoryId) {
      setMessage("Add a category first.");
      return;
    }
    const { data, error } = await upsertWebsiteMenuItem({
      categoryId,
      name: "New dish",
      description: "",
      price: null,
      currency: "CZK",
      imageUrl: "",
      featured: true,
      available: true,
      sortOrder: items.length,
      badge: "",
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data) onItemsChange([...items, data]);
    setMessage("Menu item added — edit name/price below.");
  };

  return (
    <div className="space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Menu preview</p>
      <p className="text-[11px] text-gray-500">
        Homepage shows available dishes. PDF books appear when uploaded.
      </p>

      <div className="rounded-lg border border-gray-200 p-2 dark:border-gray-700">
        <p className="mb-2 text-[11px] font-medium text-gray-600 dark:text-gray-300">Menu PDFs</p>
        <MenuPdfManager initial={menuPdfs} compact onChange={onMenuPdfsChange} />
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Categories</p>
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center gap-2">
            <input
              className="pos-input flex-1 !py-1 text-sm"
              value={cat.name}
              onChange={(event) =>
                onCategoriesChange(
                  categories.map((row) =>
                    row.id === cat.id ? { ...row, name: event.target.value } : row,
                  ),
                )
              }
              onBlur={async () => {
                const current = categories.find((row) => row.id === cat.id);
                if (!current) return;
                const { data } = await upsertWebsiteMenuCategory(current);
                if (data) {
                  onCategoriesChange(categories.map((row) => (row.id === cat.id ? data : row)));
                }
              }}
            />
            <button
              type="button"
              className="text-[11px] text-gray-500"
              onClick={async () => {
                const { data } = await upsertWebsiteMenuCategory({
                  ...cat,
                  enabled: !cat.enabled,
                });
                if (data) {
                  onCategoriesChange(categories.map((row) => (row.id === cat.id ? data : row)));
                }
              }}
            >
              {cat.enabled ? "Hide" : "Show"}
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            className="pos-input flex-1 !py-1 text-sm"
            placeholder="New category"
            onKeyDown={(event) => {
              if (event.key === "Enter") void addCategory();
            }}
          />
          <button
            type="button"
            onClick={() => void addCategory()}
            className="rounded-lg border px-2 py-1 text-xs"
          >
            Add
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Items</p>
          <button
            type="button"
            onClick={() => void addItem()}
            className="text-[11px] font-medium text-[#8B6914]"
          >
            + Item
          </button>
        </div>
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <li
              key={item.id}
              className="space-y-1.5 rounded-lg border border-gray-200 p-2 dark:border-gray-700"
            >
              <input
                className="pos-input !py-1 text-sm"
                value={item.name}
                onChange={(event) =>
                  onItemsChange(
                    items.map((row) =>
                      row.id === item.id ? { ...row, name: event.target.value } : row,
                    ),
                  )
                }
              />
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  className="pos-input !py-1 text-xs"
                  value={item.categoryId}
                  onChange={(event) =>
                    onItemsChange(
                      items.map((row) =>
                        row.id === item.id ? { ...row, categoryId: event.target.value } : row,
                      ),
                    )
                  }
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="pos-input !py-1 text-xs"
                  placeholder="Price"
                  value={item.price ?? ""}
                  onChange={(event) =>
                    onItemsChange(
                      items.map((row) =>
                        row.id === item.id
                          ? {
                              ...row,
                              price: event.target.value ? Number(event.target.value) : null,
                            }
                          : row,
                      ),
                    )
                  }
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={item.featured}
                    onChange={(event) =>
                      onItemsChange(
                        items.map((row) =>
                          row.id === item.id ? { ...row, featured: event.target.checked } : row,
                        ),
                      )
                    }
                  />
                  Featured
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={item.available}
                    onChange={(event) =>
                      onItemsChange(
                        items.map((row) =>
                          row.id === item.id ? { ...row, available: event.target.checked } : row,
                        ),
                      )
                    }
                  />
                  Available
                </label>
                <button
                  type="button"
                  className="ml-auto rounded bg-emerald-600 px-2 py-0.5 text-white"
                  onClick={async () => {
                    const row = items.find((entry) => entry.id === item.id);
                    if (!row) return;
                    const { data, error } = await upsertWebsiteMenuItem(row);
                    setMessage(error ? error.message : `Saved ${row.name}.`);
                    if (data) {
                      onItemsChange(items.map((entry) => (entry.id === item.id ? data : entry)));
                    }
                  }}
                >
                  Save
                </button>
              </div>
              <p className="text-[10px] text-gray-400">{formatPrice(item.price, item.currency)}</p>
            </li>
          ))}
        </ul>
      </div>
      {message ? <p className="text-[11px] text-gray-500">{message}</p> : null}
    </div>
  );
}

export function DesignerMenuCanvasPreview({
  categories,
  items,
  menuPdfs,
  bodyClass,
}: {
  categories: WebsiteMenuCategory[];
  items: WebsiteMenuItem[];
  menuPdfs: WebsiteMenuPdf[];
  bodyClass: string;
}) {
  const enabledCategories = categories.filter((row) => row.enabled);
  const availableItems = items.filter((row) => row.available);

  return (
    <div className="space-y-6">
      {menuPdfs.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#121214] p-4 text-center">
          <p className={`text-white/70 ${bodyClass}`}>
            Digital menu books ready ({menuPdfs.map((row) => row.language.toUpperCase()).join(", ")})
          </p>
        </div>
      ) : null}
      {enabledCategories.slice(0, 3).map((category) => {
        const categoryItems = availableItems
          .filter((item) => item.categoryId === category.id)
          .slice(0, 4);
        if (categoryItems.length === 0) return null;
        return (
          <div key={category.id}>
            <h3 className="mb-3 border-b border-white/10 pb-2 text-xs uppercase tracking-[0.2em] text-white/80">
              {category.name}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {categoryItems.map((item) => (
                <article
                  key={item.id}
                  className="flex gap-3 border border-white/10 bg-[#121214] p-3"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="h-14 w-14 shrink-0 object-cover" />
                  ) : (
                    <div className="h-14 w-14 shrink-0 bg-[#1f1f22]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-white">{item.name}</p>
                      <span className="shrink-0 text-xs text-[#C9A88B]">
                        {formatPrice(item.price, item.currency)}
                      </span>
                    </div>
                    {item.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-white/50">{item.description}</p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        );
      })}
      {enabledCategories.length === 0 || availableItems.length === 0 ? (
        <p className={`text-white/50 ${bodyClass}`}>
          No menu items yet — add categories and dishes in the inspector →
        </p>
      ) : null}
    </div>
  );
}

export function DesignerAmenitiesCanvasPreview({
  amenities,
  bodyClass,
}: {
  amenities: WebsiteAmenity[];
  bodyClass: string;
}) {
  const rows = amenities.filter((row) => row.enabled);
  if (rows.length === 0) {
    return (
      <p className={`text-white/50 ${bodyClass}`}>
        No amenities yet — add them and upload PNG icons in the inspector →
      </p>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rows.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-4 border border-white/10 px-4 py-4 text-white/85"
        >
          {item.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.iconUrl}
              alt=""
              className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center border border-[#C9A88B]/40 text-sm uppercase text-[#C9A88B] sm:h-16 sm:w-16">
              {(item.label.trim()[0] || "•").toUpperCase()}
            </span>
          )}
          <span className={`leading-snug ${bodyClass}`}>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
