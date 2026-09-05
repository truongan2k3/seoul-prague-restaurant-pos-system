"use client";

import { useRef, useState } from "react";
import { Upload, Trash2, Move } from "lucide-react";
import type { MediaSlotSpec } from "@/lib/website/media-slots";
import type { WebsiteMediaAsset } from "@/lib/website/types";
import {
  deleteWebsiteMediaSlot,
  updateWebsiteMediaObjectPosition,
} from "@/src/lib/website-actions";

interface MediaSlotCardProps {
  spec: MediaSlotSpec;
  asset: WebsiteMediaAsset | null;
  onUpdated: () => void;
}

export function MediaSlotCard({ spec, asset, onUpdated }: MediaSlotCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(asset?.objectPosition ?? "50% 50%");

  const accept =
    spec.kind === "video"
      ? "video/mp4,video/webm"
      : "image/png,image/jpeg,image/webp,image/svg+xml";

  const parsePosition = (value: string) => {
    const parts = value.split(/\s+/);
    return {
      x: Number.parseFloat(parts[0] ?? "50") || 50,
      y: Number.parseFloat(parts[1] ?? "50") || 50,
    };
  };

  const handleFile = async (file: File) => {
    setMessage(null);
    setWarning(null);
    setError(null);

    const recommendedBytes = spec.maxSizeMb * 1024 * 1024;
    if (file.size > recommendedBytes) {
      setWarning(
        `Recommended size is up to ${spec.maxSizeMb} MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB — upload continues, but the page may load slower.`,
      );
    }

    if (spec.kind === "image" && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => {
          const ratio = img.width / img.height;
          const expected = spec.recommendedWidth / spec.recommendedHeight;
          if (Math.abs(ratio - expected) > 0.15) {
            setWarning(
              (prev) =>
                `${prev ? `${prev} ` : ""}Recommended aspect ratio is ${spec.aspectRatio}. Your image is ${img.width}×${img.height}px.`,
            );
          } else if (
            img.width < spec.recommendedWidth * 0.7 ||
            img.height < spec.recommendedHeight * 0.7
          ) {
            setWarning(
              (prev) =>
                `${prev ? `${prev} ` : ""}Image is smaller than recommended (${spec.recommendedWidth}×${spec.recommendedHeight}px).`,
            );
          }
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
      });
    }

    setBusy(true);
    try {
      const { uploadWebsiteSlotFile } = await import(
        "@/components/admin/website/inline-plus-upload"
      );
      const result = await uploadWebsiteSlotFile(spec.slot, file, spec.title);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.warning) {
        setWarning((prev) => `${prev ? `${prev} ` : ""}${result.warning}`);
      }
      setMessage("Saved.");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed unexpectedly.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    const { error: deleteError } = await deleteWebsiteMediaSlot(spec.slot);
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setMessage("Removed.");
    onUpdated();
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (spec.kind !== "image" || !asset?.fileUrl) return;
    const current = parsePosition(position);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      posX: current.x,
      posY: current.y,
    };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const dx = ((event.clientX - dragRef.current.startX) / rect.width) * 100;
    const dy = ((event.clientY - dragRef.current.startY) / rect.height) * 100;
    // Dragging the image content: reverse direction for natural feel.
    const nextX = Math.min(100, Math.max(0, dragRef.current.posX - dx));
    const nextY = Math.min(100, Math.max(0, dragRef.current.posY - dy));
    setPosition(`${nextX.toFixed(1)}% ${nextY.toFixed(1)}%`);
  };

  const onPointerUp = async () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setBusy(true);
    const { error: saveError } = await updateWebsiteMediaObjectPosition(spec.slot, position);
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setMessage("Image position saved.");
    onUpdated();
  };

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h3 className="font-semibold">{spec.title}</h3>
      <p className="mt-1 text-sm text-gray-500">{spec.description}</p>
      <dl className="mt-3 grid gap-1 text-xs text-gray-500">
        <div>Recommended: {spec.recommendedWidth} × {spec.recommendedHeight} px</div>
        <div>Aspect ratio: {spec.aspectRatio}</div>
        <div>
          Formats: {spec.formats.join(", ")} · recommended up to {spec.maxSizeMb} MB (not a hard limit)
        </div>
      </dl>

      <div
        ref={frameRef}
        className="relative mt-4 overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
        style={{ aspectRatio: `${spec.recommendedWidth} / ${spec.recommendedHeight}` }}
      >
        {asset?.fileUrl ? (
          spec.kind === "video" ? (
            <video src={asset.fileUrl} controls className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.fileUrl}
              alt={asset.altText || spec.title}
              className="h-full w-full cursor-grab object-cover active:cursor-grabbing"
              style={{ objectPosition: position }}
              draggable={false}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => void onPointerUp()}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
            />
          )
        ) : (
          <div className="flex h-full min-h-[9rem] items-center justify-center text-sm text-gray-400">
            No file uploaded
          </div>
        )}
        {asset?.fileUrl && spec.kind === "image" ? (
          <p className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wide text-white">
            <Move className="h-3 w-3" /> Drag to reposition
          </p>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
        >
          <Upload className="h-4 w-4" />
          {asset ? "Replace" : "Upload"}
        </button>
        {asset ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleDelete()}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        ) : null}
      </div>
      {warning ? <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{warning}</p> : null}
      {error ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p> : null}
      {message ? <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{message}</p> : null}
    </article>
  );
}
