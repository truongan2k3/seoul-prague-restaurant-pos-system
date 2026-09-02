"use client";

import { useRef, useState } from "react";
import { Upload, Trash2 } from "lucide-react";
import type { MediaSlotSpec } from "@/lib/website/media-slots";
import type { WebsiteMediaAsset } from "@/lib/website/types";
import { deleteWebsiteMediaSlot, uploadWebsiteMediaSlot } from "@/src/lib/website-actions";

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

interface MediaSlotCardProps {
  spec: MediaSlotSpec;
  asset: WebsiteMediaAsset | null;
  onUpdated: () => void;
}

export function MediaSlotCard({ spec, asset, onUpdated }: MediaSlotCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const accept =
    spec.kind === "video"
      ? "video/mp4,video/webm"
      : "image/png,image/jpeg,image/webp,image/svg+xml";

  const handleFile = async (file: File) => {
    setMessage(null);
    setWarning(null);
    const maxBytes = spec.maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setMessage(`File must be ≤ ${spec.maxSizeMb} MB.`);
      return;
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
              `Recommended aspect ratio is ${spec.aspectRatio}. Your image is ${img.width}×${img.height}px.`,
            );
          } else if (
            img.width < spec.recommendedWidth * 0.7 ||
            img.height < spec.recommendedHeight * 0.7
          ) {
            setWarning(
              `Image is smaller than recommended (${spec.recommendedWidth}×${spec.recommendedHeight}px).`,
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
    const base64 = await fileToBase64(file);
    const { error } = await uploadWebsiteMediaSlot({
      slot: spec.slot,
      fileBase64: base64,
      fileName: file.name,
      mimeType: file.type,
      altText: spec.title,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Saved.");
    onUpdated();
  };

  const handleDelete = async () => {
    setBusy(true);
    const { error } = await deleteWebsiteMediaSlot(spec.slot);
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Removed.");
    onUpdated();
  };

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h3 className="font-semibold">{spec.title}</h3>
      <p className="mt-1 text-sm text-gray-500">{spec.description}</p>
      <dl className="mt-3 grid gap-1 text-xs text-gray-500">
        <div>Recommended: {spec.recommendedWidth} × {spec.recommendedHeight} px</div>
        <div>Aspect ratio: {spec.aspectRatio}</div>
        <div>Formats: {spec.formats.join(", ")} · max {spec.maxSizeMb} MB</div>
      </dl>

      <div className="mt-4 overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
        {asset?.fileUrl ? (
          spec.kind === "video" ? (
            <video src={asset.fileUrl} controls className="max-h-48 w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.fileUrl} alt={asset.altText || spec.title} className="max-h-48 w-full object-cover" />
          )
        ) : (
          <div className="flex h-36 items-center justify-center text-sm text-gray-400">No file uploaded</div>
        )}
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
      {message ? <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{message}</p> : null}
    </article>
  );
}
