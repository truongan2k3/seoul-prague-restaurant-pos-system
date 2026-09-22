"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { SignatureLayoutPicker } from "@/components/admin/website/content-layout-picker";
import { uploadFileDirectToStorage } from "@/lib/website/direct-upload";
import {
  createBlockImage,
  createContentBlock,
  normalizePageLayout,
} from "@/lib/website/page-layout";
import { saveWebsiteSettings } from "@/src/lib/website-actions";
import type {
  WebsiteBlockImage,
  WebsiteContent,
  WebsiteContentLayout,
  WebsitePageSection,
  WebsiteSettings,
} from "@/lib/website/types";

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-[#C9A88B] focus:ring-2 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}

function formatMenuPrice(price: number | null, currency: string): string {
  if (price == null || Number.isNaN(price)) return "";
  try {
    return new Intl.NumberFormat("cs-CZ", {
      style: "currency",
      currency: currency || "CZK",
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${price} ${currency || "CZK"}`;
  }
}

function dishesFromSection(
  section: WebsitePageSection | undefined,
  content: WebsiteContent,
): WebsiteBlockImage[] {
  const blocks = section?.props?.blocks ?? [];
  if (blocks.length === 1 && blocks[0].images.length > 0) {
    return blocks[0].images.map((img, i) => createBlockImage({ ...img, sortOrder: i }));
  }
  if (blocks.length > 1) {
    return blocks.flatMap((block, index) => {
      if (block.images.length > 0) {
        return block.images.map((img, imgIndex) =>
          createBlockImage({
            ...img,
            title: img.title || block.title,
            body: img.body || block.body,
            badge: img.badge || block.eyebrow,
            ctaLabel: img.ctaLabel || block.ctaLabel,
            ctaHref: img.ctaHref || block.ctaHref,
            sortOrder: index * 100 + imgIndex,
          }),
        );
      }
      return [
        createBlockImage({
          id: `dish-${block.id}`,
          title: block.title || "Untitled dish",
          body: block.body,
          badge: block.eyebrow,
          ctaLabel: block.ctaLabel,
          ctaHref: block.ctaHref,
          sortOrder: index,
          enabled: block.enabled,
        }),
      ];
    });
  }

  return content.menuItems
    .filter((item) => item.featured && item.available)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 6)
    .map((item, index) => {
      const asset = [content.media.signature_1, content.media.signature_2, content.media.signature_3][
        index % 3
      ];
      return createBlockImage({
        id: `sig-${item.id}`,
        url: item.imageUrl || asset?.fileUrl || "",
        alt: item.name,
        title: item.name,
        body: item.description,
        badge: item.badge || undefined,
        price: formatMenuPrice(item.price, item.currency),
        objectPosition: item.imageUrl ? "50% 50%" : (asset?.objectPosition ?? "50% 50%"),
        sortOrder: index,
        enabled: true,
      });
    });
}

function DishPreviewCard({ dish }: { dish: WebsiteBlockImage }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-[#121214] text-white dark:border-gray-700">
      <div className="relative aspect-[4/3] bg-gray-800">
        {dish.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dish.url}
            alt={dish.alt || dish.title || ""}
            className="h-full w-full object-cover"
            style={{ objectPosition: dish.objectPosition ?? "50% 50%" }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-white/30">No image</div>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        {dish.badge ? (
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#C9A88B]">{dish.badge}</p>
        ) : null}
        <p className="font-serif text-base leading-snug">{dish.title || "Untitled dish"}</p>
        {dish.body ? (
          <p className="line-clamp-2 text-[11px] leading-relaxed text-white/55">{dish.body}</p>
        ) : null}
        <div className="flex items-center gap-2 pt-1">
          {dish.price ? <span className="text-xs text-[#E8D5C4]">{dish.price}</span> : null}
          {dish.ctaLabel ? (
            <span className="border border-white/20 px-2 py-0.5 text-[9px] uppercase tracking-wider text-white/70">
              {dish.ctaLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ImageDropzone({
  dish,
  onChange,
}: {
  dish: WebsiteBlockImage;
  onChange: (next: WebsiteBlockImage) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    const uploaded = await uploadFileDirectToStorage(file, "misc");
    setBusy(false);
    if (uploaded.publicUrl) {
      onChange({
        ...dish,
        url: uploaded.publicUrl,
        alt: dish.alt || file.name.replace(/\.[^.]+$/, ""),
      });
    }
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file?.type.startsWith("image/")) void upload(file);
        }}
        className={`relative overflow-hidden rounded-xl border-2 border-dashed ${
          dragOver
            ? "border-[#C9A88B] bg-[#C9A88B]/10"
            : "border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50"
        }`}
      >
        {dish.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dish.url}
            alt={dish.alt || dish.title || ""}
            className="aspect-[4/3] w-full object-cover"
            style={{ objectPosition: dish.objectPosition ?? "50% 50%" }}
          />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 text-sm text-gray-500"
          >
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
            Drag & drop image, or click to upload
          </button>
        )}
        {busy && dish.url ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium dark:border-gray-700"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {dish.url ? "Replace image" : "Upload image"}
        </button>
        {dish.url ? (
          <button
            type="button"
            onClick={() => onChange({ ...dish, url: "" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 dark:border-red-900"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove image
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}

function DishEditor({
  dish,
  index,
  total,
  selected,
  onSelect,
  onChange,
  onDuplicate,
  onRemove,
  onMove,
}: {
  dish: WebsiteBlockImage;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (next: WebsiteBlockImage) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white dark:bg-gray-900 ${
        selected
          ? "border-[#C9A88B] ring-2 ring-[#C9A88B]/30"
          : "border-gray-200 dark:border-gray-800"
      } ${dish.enabled === false ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <GripVertical className="h-4 w-4 text-gray-400" aria-hidden />
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {index + 1}. {dish.title || "Untitled dish"}
          </span>
          {dish.badge ? (
            <span className="text-[11px] uppercase tracking-wider text-[#8B6914]">{dish.badge}</span>
          ) : null}
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-30 dark:border-gray-700"
            title="Move up"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={index >= total - 1}
            onClick={() => onMove(1)}
            className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-30 dark:border-gray-700"
            title="Move down"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...dish, enabled: dish.enabled === false })}
            className="rounded-lg border border-gray-200 p-1.5 dark:border-gray-700"
            title={dish.enabled === false ? "Enable" : "Disable"}
          >
            {dish.enabled === false ? (
              <EyeOff className="h-4 w-4 text-gray-400" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded-lg border border-gray-200 p-1.5 dark:border-gray-700"
            title="Duplicate"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-red-200 p-1.5 text-red-600 dark:border-red-900"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {selected ? (
        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-4">
            <ImageDropzone dish={dish} onChange={onChange} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Dish name">
                <input
                  className={inputClass}
                  value={dish.title ?? ""}
                  onChange={(e) => onChange({ ...dish, title: e.target.value, alt: e.target.value })}
                  placeholder="e.g. Angus Sirloin"
                />
              </Field>
              <Field label="Badge / tag">
                <input
                  className={inputClass}
                  value={dish.badge ?? ""}
                  onChange={(e) => onChange({ ...dish, badge: e.target.value })}
                  placeholder="Signature, Chef's pick…"
                />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                className={`${inputClass} min-h-[100px]`}
                value={dish.body ?? ""}
                onChange={(e) => onChange({ ...dish, body: e.target.value })}
                placeholder="Short description guests see on the card"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Price">
                <input
                  className={inputClass}
                  value={dish.price ?? ""}
                  onChange={(e) => onChange({ ...dish, price: e.target.value })}
                  placeholder="420 Kč"
                />
              </Field>
              <Field label="CTA label">
                <input
                  className={inputClass}
                  value={dish.ctaLabel ?? ""}
                  onChange={(e) => onChange({ ...dish, ctaLabel: e.target.value })}
                  placeholder="View menu"
                />
              </Field>
              <Field label="CTA link">
                <input
                  className={inputClass}
                  value={dish.ctaHref ?? ""}
                  onChange={(e) => onChange({ ...dish, ctaHref: e.target.value })}
                  placeholder="/menu"
                />
              </Field>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500">Live preview</p>
            <DishPreviewCard dish={dish} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Dedicated Signature Dishes CMS editor — visual layout, dish cards, image UX.
 * Persists into the Signature section's content block (backward compatible JSON).
 */
export function SignatureDishesEditor({
  content,
  embedded = false,
  section: controlledSection,
  onSectionChange,
}: {
  content: WebsiteContent;
  embedded?: boolean;
  /** When embedded in Section Builder, pass live section + change handler. */
  section?: WebsitePageSection;
  onSectionChange?: (next: WebsitePageSection) => void;
}) {
  const initialLayout = useMemo(
    () => normalizePageLayout(content.settings.pageLayout),
    [content.settings.pageLayout],
  );
  const [layoutRows, setLayoutRows] = useState(initialLayout);
  const [settings, setSettings] = useState<WebsiteSettings>(content.settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const signatureIndex = layoutRows.findIndex((row) => row.type === "signature");
  const liveSection =
    controlledSection ??
    layoutRows[signatureIndex] ??
    ({
      id: "sec-signature",
      type: "signature" as const,
      enabled: true,
      sortOrder: 3,
      props: {
        eyebrow: "Signature",
        headline: "Fire & flavour",
        body: "Premium cuts and Korean classics.",
        defaultLayout: "cards_3" as WebsiteContentLayout,
      },
    } satisfies WebsitePageSection);

  const [dishes, setDishes] = useState<WebsiteBlockImage[]>(() =>
    dishesFromSection(liveSection, content),
  );
  const collectionLayout: WebsiteContentLayout =
    (liveSection.props?.blocks?.[0]?.layout as WebsiteContentLayout | undefined) ||
    liveSection.props?.defaultLayout ||
    "cards_3";

  const activeId = selectedId ?? dishes[0]?.id ?? null;

  const reindex = (rows: WebsiteBlockImage[]) =>
    rows.map((row, index) => ({ ...row, sortOrder: index }));

  const patchSection = (propsPatch: NonNullable<WebsitePageSection["props"]>) => {
    const nextProps = { ...liveSection.props, ...propsPatch };
    const nextSection: WebsitePageSection = { ...liveSection, props: nextProps };
    if (onSectionChange) {
      onSectionChange(nextSection);
      return;
    }
    if (signatureIndex >= 0) {
      const rows = [...layoutRows];
      rows[signatureIndex] = nextSection;
      setLayoutRows(rows);
      setSettings((prev) => ({ ...prev, pageLayout: rows }));
    }
  };

  const syncDishesToSection = (
    nextDishes: WebsiteBlockImage[],
    layout: WebsiteContentLayout = collectionLayout,
  ) => {
    const images = reindex(nextDishes);
    setDishes(images);
    const existing = liveSection.props?.blocks?.[0];
    const block = createContentBlock(layout, {
      id: existing?.id ?? "signature-dishes",
      enabled: true,
      sortOrder: 0,
      eyebrow: "",
      title: "",
      body: "",
      images,
    });
    patchSection({
      defaultLayout: layout,
      blocks: [block],
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const images = reindex(dishes);
    const block = createContentBlock(collectionLayout, {
      id: liveSection.props?.blocks?.[0]?.id ?? "signature-dishes",
      enabled: true,
      sortOrder: 0,
      eyebrow: "",
      title: "",
      body: "",
      images,
    });
    const nextLayout = layoutRows.map((row) =>
      row.type === "signature"
        ? {
            ...row,
            props: {
              ...row.props,
              eyebrow: liveSection.props?.eyebrow,
              headline: liveSection.props?.headline,
              body: liveSection.props?.body,
              defaultLayout: collectionLayout,
              blocks: [block],
            },
          }
        : row,
    );
    const { error } = await saveWebsiteSettings({ pageLayout: nextLayout });
    setSaving(false);
    setLayoutRows(nextLayout);
    setSettings((prev) => ({ ...prev, pageLayout: nextLayout }));
    setDishes(images);
    setMessage(error ? error.message : "Signature dishes saved.");
  };

  return (
    <div className="space-y-6">
      {!embedded ? (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Signature dishes</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Edit each dish with a live preview. Choose a layout, then reorder, enable, or duplicate
              dishes. Changes save into the Signature section without breaking existing content.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save signature
          </button>
        </header>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Section text</h2>
          <p className="text-xs text-gray-500">Headline shown above the dish grid.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Eyebrow">
            <input
              className={inputClass}
              value={liveSection.props?.eyebrow ?? ""}
              onChange={(e) => patchSection({ eyebrow: e.target.value })}
            />
          </Field>
          <Field label="Headline">
            <input
              className={inputClass}
              value={liveSection.props?.headline ?? ""}
              onChange={(e) => patchSection({ headline: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Supporting text">
          <textarea
            className={`${inputClass} min-h-[72px]`}
            value={liveSection.props?.body ?? ""}
            onChange={(e) => patchSection({ body: e.target.value })}
          />
        </Field>
      </section>

      <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Layout</h2>
          <p className="text-xs text-gray-500">
            Pick how dishes arrange on desktop. Mobile stays a clean stacked card list.
          </p>
        </div>
        <SignatureLayoutPicker
          value={collectionLayout}
          onChange={(layout) => syncDishesToSection(dishes, layout)}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dishes</h2>
            <p className="text-xs text-gray-500">
              Add, duplicate, delete, and reorder. First dish is featured when using Featured layout.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = reindex([
                ...dishes,
                createBlockImage({
                  title: "New signature dish",
                  body: "",
                  badge: "",
                  sortOrder: dishes.length,
                  enabled: true,
                }),
              ]);
              syncDishesToSection(next);
              setSelectedId(next[next.length - 1]?.id ?? null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9A88B] px-3 py-2 text-xs font-semibold text-[#1a1210]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Signature Dish
          </button>
        </div>

        {dishes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700">
            No dishes yet. Add one, or mark menu items as Featured (used as a fallback until you save
            here).
          </p>
        ) : (
          <div className="space-y-3">
            {dishes.map((dish, index) => (
              <DishEditor
                key={dish.id}
                dish={dish}
                index={index}
                total={dishes.length}
                selected={dish.id === activeId}
                onSelect={() => setSelectedId(dish.id)}
                onChange={(next) => {
                  const rows = [...dishes];
                  rows[index] = next;
                  syncDishesToSection(rows);
                }}
                onDuplicate={() => {
                  const clone = createBlockImage({
                    ...dish,
                    id: undefined,
                    title: dish.title ? `${dish.title} (copy)` : "Dish copy",
                  });
                  const rows = [...dishes];
                  rows.splice(index + 1, 0, clone);
                  syncDishesToSection(rows);
                  setSelectedId(clone.id);
                }}
                onRemove={() => {
                  const rows = dishes.filter((row) => row.id !== dish.id);
                  syncDishesToSection(rows);
                  if (activeId === dish.id) setSelectedId(rows[0]?.id ?? null);
                }}
                onMove={(dir) => {
                  const target = index + dir;
                  if (target < 0 || target >= dishes.length) return;
                  const rows = [...dishes];
                  const [moved] = rows.splice(index, 1);
                  rows.splice(target, 0, moved);
                  syncDishesToSection(rows);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {message ? (
        <p
          className={`text-sm ${
            message.toLowerCase().includes("fail") || message.toLowerCase().includes("error")
              ? "text-red-600"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {message}
        </p>
      ) : null}

      {!embedded ? (
        <p className="text-xs text-gray-500">
          Tip: section visibility and order are managed in{" "}
          <a href="/admin/sections" className="underline">
            Sections
          </a>
          .
        </p>
      ) : (
        <p className="text-xs text-gray-500">
          Save the Section Builder to persist Signature dish edits.
        </p>
      )}
    </div>
  );
}
