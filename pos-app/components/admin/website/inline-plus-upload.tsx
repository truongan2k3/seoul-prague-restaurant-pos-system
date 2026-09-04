"use client";

import { useRef, useState } from "react";
import { Loader2, Plus, Replace } from "lucide-react";
import type { WebsiteMediaAsset, WebsiteMediaSlot } from "@/lib/website/types";

type UploadKind = "slot" | "gallery" | "video";

export async function uploadWebsiteSlotFile(
  slot: WebsiteMediaSlot,
  file: File,
  altText = "",
): Promise<{ data?: WebsiteMediaAsset; error?: string; warning?: string | null }> {
  const form = new FormData();
  form.set("slot", slot);
  form.set("file", file);
  form.set("altText", altText);
  const response = await fetch("/api/website/media", { method: "POST", body: form });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: WebsiteMediaAsset;
    error?: string;
    warning?: string | null;
  };
  if (!response.ok) return { error: payload.error || `Upload failed (HTTP ${response.status})` };
  return { data: payload.data, warning: payload.warning };
}

export async function uploadWebsiteGalleryFile(
  file: File,
  title = "",
  category = "food",
): Promise<{ data?: { id: string; imageUrl: string; title: string }; error?: string; warning?: string | null }> {
  const form = new FormData();
  form.set("file", file);
  form.set("title", title);
  form.set("category", category);
  const response = await fetch("/api/website/gallery", { method: "POST", body: form });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: { id: string; imageUrl: string; title: string };
    error?: string;
    warning?: string | null;
  };
  if (!response.ok) return { error: payload.error || `Upload failed (HTTP ${response.status})` };
  return { data: payload.data, warning: payload.warning };
}

export async function uploadWebsiteVideoApiFile(
  file: File,
  title = "Promo video",
  slot: "hero" | "promo" | "atmosphere" = "promo",
): Promise<{
  data?: { id: string; videoUrl: string; title: string; posterUrl: string };
  error?: string;
  warning?: string | null;
}> {
  const form = new FormData();
  form.set("file", file);
  form.set("title", title);
  form.set("slot", slot);
  const response = await fetch("/api/website/video", { method: "POST", body: form });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: { id: string; videoUrl: string; title: string; posterUrl: string };
    error?: string;
    warning?: string | null;
  };
  if (!response.ok) return { error: payload.error || `Upload failed (HTTP ${response.status})` };
  return { data: payload.data, warning: payload.warning };
}

/** Compact “+” control for in-canvas / inspector uploads (FormData — avoids server-action base64 limits). */
export function InlinePlusUpload({
  accept,
  label = "Add media",
  busyLabel = "Uploading…",
  hasMedia = false,
  className = "",
  onFile,
}: {
  accept: string;
  label?: string;
  busyLabel?: string;
  hasMedia?: boolean;
  className?: string;
  onFile: (file: File) => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setBusy(true);
          void Promise.resolve(onFile(file)).finally(() => setBusy(false));
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          inputRef.current?.click();
        }}
        className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-dashed border-white/35 bg-black/45 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur transition hover:border-[#C9A88B] hover:bg-black/60 disabled:opacity-60 ${className}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : hasMedia ? <Replace className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {busy ? busyLabel : hasMedia ? "Replace" : label}
      </button>
    </>
  );
}

export type { UploadKind };
