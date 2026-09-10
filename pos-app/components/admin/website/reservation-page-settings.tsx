"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Save, Trash2, Upload } from "lucide-react";
import { ReservationPageBackground } from "@/components/landing/reservation-page-background";
import { uploadFileDirectToStorage } from "@/lib/website/direct-upload";
import {
  DEFAULT_RESERVATION_BACKGROUND,
  RESERVATION_BG_UPLOAD_TIPS,
  normalizeReservationBackground,
} from "@/lib/website/reservation-background";
import type { WebsiteReservationBackground, WebsiteSettings } from "@/lib/website/types";
import { saveWebsiteSettings } from "@/src/lib/website-actions";

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none ring-[#C9A88B] focus:ring-2 dark:border-gray-700 dark:bg-gray-950";

const VIDEO_ACCEPT = "video/webm,video/mp4,video/quicktime,image/gif";
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const MAX_DESKTOP_BYTES = 12 * 1024 * 1024;
const MAX_MOBILE_BYTES = 6 * 1024 * 1024;
const MAX_POSTER_BYTES = 2 * 1024 * 1024;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-gray-500">{hint}</span> : null}
    </label>
  );
}

export function ReservationPageSettingsEditor({
  initialSettings,
}: {
  initialSettings: WebsiteSettings;
}) {
  const router = useRouter();
  const [bg, setBg] = useState<WebsiteReservationBackground>(() =>
    normalizeReservationBackground(initialSettings.reservationBackground),
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">("mobile");

  const desktopInput = useRef<HTMLInputElement>(null);
  const mobileInput = useRef<HTMLInputElement>(null);
  const posterInput = useRef<HTMLInputElement>(null);

  const patch = (partial: Partial<WebsiteReservationBackground>) => {
    setBg((prev) => ({ ...prev, ...partial }));
  };

  const upload = async (
    kind: "desktop" | "mobile" | "poster",
    file: File,
  ) => {
    setError(null);
    setMessage(null);

    const max =
      kind === "desktop"
        ? MAX_DESKTOP_BYTES
        : kind === "mobile"
          ? MAX_MOBILE_BYTES
          : MAX_POSTER_BYTES;
    if (file.size > max) {
      setError(
        `File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max ${(max / (1024 * 1024)).toFixed(0)}MB for ${kind}.`,
      );
      return;
    }
    if (kind !== "poster" && file.type === "image/gif") {
      setMessage(
        "GIF accepted, but WebM/MP4 is strongly preferred for performance and cache egress.",
      );
    }

    setUploading(kind);
    const result = await uploadFileDirectToStorage(file, "reservation-bg");
    setUploading(null);
    if (!result.publicUrl) {
      setError(result.error || "Upload failed.");
      return;
    }

    if (kind === "desktop") patch({ videoUrl: result.publicUrl, enabled: true });
    if (kind === "mobile") patch({ videoUrlMobile: result.publicUrl, enabled: true });
    if (kind === "poster") patch({ posterUrl: result.publicUrl, enabled: true });
    setMessage(`${kind === "poster" ? "Poster" : kind === "mobile" ? "Mobile video" : "Desktop video"} uploaded. Save to publish.`);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const normalized = normalizeReservationBackground(bg);
    const { error: saveError } = await saveWebsiteSettings({
      reservationBackground: normalized,
    });
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setBg(normalized);
    setMessage("Reservation background published.");
    router.refresh();
  };

  const clearAll = () => {
    setBg({ ...DEFAULT_RESERVATION_BACKGROUND });
    setMessage("Cleared locally — click Save to publish removal.");
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reservation page settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Cinematic BBQ smoke / fire background behind the guest booking form. Keep loops short;
            prefer WebM + MP4 over GIF. Form readability is controlled by the overlay.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/reservation"
            target="_blank"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"
          >
            Live page ↗
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save & publish
          </button>
        </div>
      </header>

      {message ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={bg.enabled}
                onChange={(e) => patch({ enabled: e.target.checked })}
              />
              Enable background on /reservation
            </label>
            <p className="mt-2 text-xs text-gray-500">
              When disabled, the page stays solid charcoal. Uploads are kept until you clear them.
            </p>
          </section>

          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="text-sm font-semibold">Media</h2>

            <MediaSlot
              title="Desktop / tablet video"
              hint={RESERVATION_BG_UPLOAD_TIPS.desktop}
              url={bg.videoUrl}
              busy={uploading === "desktop"}
              onPick={() => desktopInput.current?.click()}
              onClear={() => patch({ videoUrl: "" })}
            />
            <input
              ref={desktopInput}
              type="file"
              accept={VIDEO_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload("desktop", file);
              }}
            />

            <MediaSlot
              title="Mobile video (optional)"
              hint={RESERVATION_BG_UPLOAD_TIPS.mobile}
              url={bg.videoUrlMobile}
              busy={uploading === "mobile"}
              onPick={() => mobileInput.current?.click()}
              onClear={() => patch({ videoUrlMobile: "" })}
            />
            <input
              ref={mobileInput}
              type="file"
              accept={VIDEO_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload("mobile", file);
              }}
            />

            <MediaSlot
              title="Poster / thumbnail fallback"
              hint={RESERVATION_BG_UPLOAD_TIPS.poster}
              url={bg.posterUrl}
              busy={uploading === "poster"}
              onPick={() => posterInput.current?.click()}
              onClear={() => patch({ posterUrl: "" })}
              isImage
            />
            <input
              ref={posterInput}
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload("poster", file);
              }}
            />

            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 dark:border-red-900"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all media
            </button>
          </section>

          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="text-sm font-semibold">Overlay & crop</h2>
            <Field
              label={`Overlay darkness — ${bg.overlayOpacity}%`}
              hint="Higher values keep the booking form easier to read over smoke/fire."
            >
              <input
                type="range"
                min={0}
                max={90}
                value={bg.overlayOpacity}
                onChange={(e) => patch({ overlayOpacity: Number(e.target.value) })}
                className="w-full"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Desktop focal point" hint='CSS object-position, e.g. "50% 40%"'>
                <input
                  className={inputClass}
                  value={bg.objectPosition}
                  onChange={(e) => patch({ objectPosition: e.target.value })}
                />
              </Field>
              <Field
                label="Mobile focal point"
                hint="Portrait crop — keep grill smoke / flame near center."
              >
                <input
                  className={inputClass}
                  value={bg.objectPositionMobile}
                  onChange={(e) => patch({ objectPositionMobile: e.target.value })}
                />
              </Field>
            </div>
          </section>

          <p className="text-xs text-gray-500">
            Run SQL if needed:{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
              supabase/patch-reservation-background.sql
            </code>
            . Storage uploads use immutable long-cache headers; mobile never downloads the desktop
            file when a mobile clip is set.
          </p>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-6 xl:self-start">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Preview</h2>
            <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs dark:border-gray-700">
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 ${previewMode === "mobile" ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : ""}`}
                onClick={() => setPreviewMode("mobile")}
              >
                Mobile
              </button>
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 ${previewMode === "desktop" ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : ""}`}
                onClick={() => setPreviewMode("desktop")}
              >
                Desktop
              </button>
            </div>
          </div>
          <div
            className={`relative mx-auto overflow-hidden rounded-2xl border border-gray-800 bg-[#0B0B0C] shadow-lg ${
              previewMode === "mobile" ? "aspect-[9/16] w-[260px]" : "aspect-[16/10] w-full"
            }`}
          >
            <ReservationPageBackground config={{ ...bg, enabled: true }} preview />
            <div className="relative z-10 flex h-full flex-col justify-end p-4">
              <div className="rounded-xl border border-white/10 bg-[#121214]/90 p-4 backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#C9A88B]">Preview</p>
                <p className="mt-1 text-sm font-medium text-white">Reservation form stays readable</p>
                <p className="mt-1 text-xs text-white/60">
                  Overlay {bg.overlayOpacity}% · {previewMode} crop
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MediaSlot({
  title,
  hint,
  url,
  busy,
  onPick,
  onClear,
  isImage = false,
}: {
  title: string;
  hint: string;
  url: string;
  busy: boolean;
  onPick: () => void;
  onClear: () => void;
  isImage?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onPick}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {url ? "Replace" : "Upload"}
          </button>
          {url ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs dark:border-gray-700"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {url ? (
        <div className="mt-3 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
          {isImage || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-36 w-full object-cover" />
          ) : (
            <video
              src={url}
              className="h-36 w-full object-cover"
              muted
              playsInline
              loop
              autoPlay
              preload="metadata"
              controls={false}
            />
          )}
          <p className="truncate px-2 py-1 text-[10px] text-gray-500">{url}</p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-400 dark:border-gray-700">
          No file yet
        </p>
      )}
    </div>
  );
}
