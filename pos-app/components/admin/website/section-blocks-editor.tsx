"use client";

import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { uploadFileDirectToStorage } from "@/lib/website/direct-upload";
import {
  CONTENT_LAYOUTS,
  createBlockImage,
  createContentBlock,
} from "@/lib/website/page-layout";
import type {
  WebsiteBlockImage,
  WebsiteContentBlock,
  WebsiteContentLayout,
} from "@/lib/website/types";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-[#C9A88B] focus:ring-2 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100";

function ImageRow({
  image,
  onChange,
  onRemove,
  onMove,
  canUp,
  canDown,
}: {
  image: WebsiteBlockImage;
  onChange: (next: WebsiteBlockImage) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  canUp: boolean;
  canDown: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/60">
      <div className="flex gap-3">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-800">
          {image.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.url} alt={image.alt || ""} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-gray-400">No image</div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              disabled={!canUp}
              onClick={() => onMove(-1)}
              className="rounded border border-gray-200 p-1 disabled:opacity-30 dark:border-gray-700"
              aria-label="Move image up"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!canDown}
              onClick={() => onMove(1)}
              className="rounded border border-gray-200 p-1 disabled:opacity-30 dark:border-gray-700"
              aria-label="Move image down"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs text-red-600 dark:border-red-900"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
          <input
            className={inputClass}
            placeholder="Alt / accessibility text"
            value={image.alt ?? ""}
            onChange={(e) => onChange({ ...image, alt: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Card title (optional)"
            value={image.title ?? ""}
            onChange={(e) => onChange({ ...image, title: e.target.value })}
          />
          <textarea
            className={`${inputClass} min-h-[56px]`}
            placeholder="Card body (optional)"
            value={image.body ?? ""}
            onChange={(e) => onChange({ ...image, body: e.target.value })}
          />
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void (async () => {
            setBusy(true);
            const uploaded = await uploadFileDirectToStorage(file, "misc");
            setBusy(false);
            if (uploaded.publicUrl) {
              onChange({ ...image, url: uploaded.publicUrl });
            }
          })();
        }}
      />
    </div>
  );
}

function BlockEditorCard({
  block,
  index,
  total,
  onChange,
  onDuplicate,
  onRemove,
  onMove,
}: {
  block: WebsiteContentBlock;
  index: number;
  total: number;
  onChange: (next: WebsiteContentBlock) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(true);
  const addInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const updateImages = (images: WebsiteBlockImage[]) => {
    onChange({
      ...block,
      images: images.map((img, i) => ({ ...img, sortOrder: i })),
    });
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-left text-sm font-semibold text-gray-900 dark:text-gray-100"
        >
          Component {index + 1}
          <span className="ml-2 font-normal text-gray-500">
            {CONTENT_LAYOUTS.find((row) => row.id === block.layout)?.label}
          </span>
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-1">
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
            onClick={() => onChange({ ...block, enabled: !block.enabled })}
            className="rounded-lg border border-gray-200 p-1.5 dark:border-gray-700"
            title={block.enabled ? "Disable" : "Enable"}
          >
            {block.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
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
            title="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open ? (
        <div className="space-y-4 p-4">
          <Field label="Layout">
            <select
              className={inputClass}
              value={block.layout}
              onChange={(e) =>
                onChange({ ...block, layout: e.target.value as WebsiteContentLayout })
              }
            >
              {CONTENT_LAYOUTS.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {layout.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {CONTENT_LAYOUTS.find((row) => row.id === block.layout)?.hint}
            </p>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eyebrow">
              <input
                className={inputClass}
                value={block.eyebrow ?? ""}
                onChange={(e) => onChange({ ...block, eyebrow: e.target.value })}
              />
            </Field>
            <Field label="Title">
              <input
                className={inputClass}
                value={block.title ?? ""}
                onChange={(e) => onChange({ ...block, title: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Body">
            <textarea
              className={`${inputClass} min-h-[88px]`}
              value={block.body ?? ""}
              onChange={(e) => onChange({ ...block, body: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CTA label">
              <input
                className={inputClass}
                value={block.ctaLabel ?? ""}
                onChange={(e) => onChange({ ...block, ctaLabel: e.target.value })}
              />
            </Field>
            <Field label="CTA link">
              <input
                className={inputClass}
                value={block.ctaHref ?? ""}
                onChange={(e) => onChange({ ...block, ctaHref: e.target.value })}
                placeholder="/reservation"
              />
            </Field>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Images</p>
              <button
                type="button"
                onClick={() => addInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-gray-100 dark:text-gray-900"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add image
              </button>
            </div>
            <input
              ref={addInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void (async () => {
                  setUploading(true);
                  const uploaded = await uploadFileDirectToStorage(file, "misc");
                  setUploading(false);
                  if (!uploaded.publicUrl) return;
                  updateImages([
                    ...block.images,
                    createBlockImage({
                      url: uploaded.publicUrl,
                      alt: file.name.replace(/\.[^.]+$/, ""),
                      sortOrder: block.images.length,
                    }),
                  ]);
                })();
              }}
            />
            {block.images.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-500 dark:border-gray-700">
                No images yet. Add one or more photos — originals stay high quality; the site serves optimized thumbnails.
              </p>
            ) : (
              <div className="space-y-3">
                {block.images.map((image, imageIndex) => (
                  <ImageRow
                    key={image.id}
                    image={image}
                    canUp={imageIndex > 0}
                    canDown={imageIndex < block.images.length - 1}
                    onChange={(next) => {
                      const images = [...block.images];
                      images[imageIndex] = next;
                      updateImages(images);
                    }}
                    onRemove={() => {
                      updateImages(block.images.filter((row) => row.id !== image.id));
                    }}
                    onMove={(dir) => {
                      const target = imageIndex + dir;
                      if (target < 0 || target >= block.images.length) return;
                      const images = [...block.images];
                      const [moved] = images.splice(imageIndex, 1);
                      images.splice(target, 0, moved);
                      updateImages(images);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SectionBlocksEditor({
  blocks,
  defaultLayout = "image_left_text_right",
  onChange,
}: {
  blocks: WebsiteContentBlock[];
  defaultLayout?: WebsiteContentLayout;
  onChange: (blocks: WebsiteContentBlock[]) => void;
}) {
  const reindex = (rows: WebsiteContentBlock[]) =>
    rows.map((row, index) => ({ ...row, sortOrder: index }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Components</h3>
          <p className="text-xs text-gray-500">
            Add as many as you need. Each can use a different layout.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange(
              reindex([
                ...blocks,
                createContentBlock(defaultLayout, { sortOrder: blocks.length }),
              ]),
            )
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9A88B] px-3 py-2 text-xs font-semibold text-[#1a1210]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add component
        </button>
      </div>

      {blocks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700">
          No components yet. Add one to control text, images, and layout for this section.
        </p>
      ) : (
        <div className="space-y-4">
          {blocks.map((block, index) => (
            <BlockEditorCard
              key={block.id}
              block={block}
              index={index}
              total={blocks.length}
              onChange={(next) => {
                const rows = [...blocks];
                rows[index] = next;
                onChange(reindex(rows));
              }}
              onDuplicate={() => {
                const clone = createContentBlock(block.layout, {
                  ...block,
                  id: undefined,
                  title: block.title ? `${block.title} (copy)` : "Component copy",
                  images: block.images.map((img) => createBlockImage({ ...img, id: undefined })),
                });
                const rows = [...blocks];
                rows.splice(index + 1, 0, clone);
                onChange(reindex(rows));
              }}
              onRemove={() => onChange(reindex(blocks.filter((row) => row.id !== block.id)))}
              onMove={(dir) => {
                const target = index + dir;
                if (target < 0 || target >= blocks.length) return;
                const rows = [...blocks];
                const [moved] = rows.splice(index, 1);
                rows.splice(target, 0, moved);
                onChange(reindex(rows));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
