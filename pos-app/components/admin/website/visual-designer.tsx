"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Move, Save } from "lucide-react";
import type { WebsiteContent, WebsiteMediaSlot, WebsiteSettings } from "@/lib/website/types";
import {
  saveWebsiteSettings,
  updateWebsiteMediaObjectPosition,
} from "@/src/lib/website-actions";

function EditableText({
  value,
  onChange,
  className,
  multiline = false,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value;
    }
  }, [value]);

  const onBlur = () => {
    const next = ref.current?.innerText?.replace(/\u00a0/g, " ").trim() ?? "";
    if (next !== value) onChange(next);
  };

  if (multiline) {
    return (
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        className={`outline-none ring-offset-2 focus:ring-2 focus:ring-[#C9A88B]/60 ${className ?? ""}`}
        onBlur={onBlur}
      />
    );
  }

  return (
    <span
      ref={ref as React.RefObject<HTMLSpanElement>}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      className={`outline-none ring-offset-2 focus:ring-2 focus:ring-[#C9A88B]/60 ${className ?? ""}`}
      onBlur={onBlur}
    />
  );
}

function DraggableMedia({
  slot,
  url,
  objectPosition,
  className,
  onPositionSaved,
}: {
  slot: WebsiteMediaSlot;
  url?: string;
  objectPosition?: string;
  className?: string;
  onPositionSaved: (slot: WebsiteMediaSlot, position: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(
    null,
  );
  const [position, setPosition] = useState(objectPosition ?? "50% 50%");

  useEffect(() => {
    setPosition(objectPosition ?? "50% 50%");
  }, [objectPosition, url]);

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-[#1a1a1c] text-sm text-white/40 ${className}`}>
        Upload in Media
      </div>
    );
  }

  const parse = (value: string) => {
    const parts = value.split(/\s+/);
    return {
      x: Number.parseFloat(parts[0] ?? "50") || 50,
      y: Number.parseFloat(parts[1] ?? "50") || 50,
    };
  };

  return (
    <div ref={frameRef} className={`relative overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="h-full w-full cursor-grab object-cover active:cursor-grabbing"
        style={{ objectPosition: position }}
        draggable={false}
        onPointerDown={(event) => {
          const current = parse(position);
          dragRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            posX: current.x,
            posY: current.y,
          };
          (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragRef.current || !frameRef.current) return;
          const rect = frameRef.current.getBoundingClientRect();
          const dx = ((event.clientX - dragRef.current.startX) / rect.width) * 100;
          const dy = ((event.clientY - dragRef.current.startY) / rect.height) * 100;
          const nextX = Math.min(100, Math.max(0, dragRef.current.posX - dx));
          const nextY = Math.min(100, Math.max(0, dragRef.current.posY - dy));
          setPosition(`${nextX.toFixed(1)}% ${nextY.toFixed(1)}%`);
        }}
        onPointerUp={() => {
          if (!dragRef.current) return;
          dragRef.current = null;
          onPositionSaved(slot, position);
        }}
      />
      <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/55 px-2 py-1 text-[10px] uppercase tracking-wide text-white">
        <Move className="h-3 w-3" /> Drag image
      </span>
    </div>
  );
}

export function WebsiteVisualDesigner({ initial }: { initial: WebsiteContent }) {
  const router = useRouter();
  const [settings, setSettings] = useState<WebsiteSettings>(initial.settings);
  const [media, setMedia] = useState(initial.media);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const patchSettings = <K extends keyof WebsiteSettings>(key: K, value: WebsiteSettings[K]) => {
    dirtyRef.current = true;
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveText = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: saveError } = await saveWebsiteSettings({
      restaurantName: settings.restaurantName,
      tagline: settings.tagline,
      description: settings.description,
      aboutStory: settings.aboutStory,
      heroHeadline: settings.heroHeadline,
      heroTagline: settings.heroTagline,
      heroDescription: settings.heroDescription,
      phone: settings.phone,
      email: settings.email,
      address: settings.address,
    });
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    dirtyRef.current = false;
    setMessage("Text saved.");
    router.refresh();
  };

  const savePosition = async (slot: WebsiteMediaSlot, objectPosition: string) => {
    setBusy(true);
    setError(null);
    const { data, error: saveError } = await updateWebsiteMediaObjectPosition(slot, objectPosition);
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    if (data) {
      setMedia((prev) => ({ ...prev, [slot]: data }));
    }
    setMessage(`Saved position for ${slot.replaceAll("_", " ")}.`);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Visual designer</h1>
          <p className="mt-2 text-sm text-gray-500">
            Click text to edit. Drag images inside their frames. Save text when finished.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/landing"
            target="_blank"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm dark:border-gray-700"
          >
            Open live site
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveText()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            Save text
          </button>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          {message}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#0B0B0C] text-white shadow-xl">
        {/* Hero */}
        <section className="relative min-h-[70vh] overflow-hidden">
          <DraggableMedia
            slot="hero_image"
            url={media.hero_image?.fileUrl}
            objectPosition={media.hero_image?.objectPosition}
            className="absolute inset-0"
            onPositionSaved={savePosition}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0C] via-[#0B0B0C]/65 to-black/25" />
          <div className="relative z-10 flex min-h-[70vh] flex-col justify-end px-8 pb-16 pt-24 lg:px-14">
            <EditableText
              value={settings.restaurantName}
              onChange={(value) => patchSettings("restaurantName", value)}
              className="mb-3 text-xs uppercase tracking-[0.35em] text-[#C9A88B]"
            />
            <EditableText
              value={settings.heroHeadline}
              onChange={(value) => patchSettings("heroHeadline", value)}
              className="landing-serif max-w-4xl text-4xl font-medium leading-tight lg:text-6xl"
            />
            <EditableText
              value={settings.heroTagline}
              onChange={(value) => patchSettings("heroTagline", value)}
              className="mt-4 max-w-xl text-lg text-white/80"
            />
            <EditableText
              value={settings.heroDescription}
              onChange={(value) => patchSettings("heroDescription", value)}
              multiline
              className="mt-3 max-w-2xl text-sm text-white/60"
            />
          </div>
        </section>

        {/* About */}
        <section className="grid gap-8 bg-[#0F0F10] px-8 py-16 lg:grid-cols-2 lg:px-14">
          <DraggableMedia
            slot="about_image"
            url={media.about_image?.fileUrl}
            objectPosition={media.about_image?.objectPosition}
            className="aspect-[3/4] w-full"
            onPositionSaved={savePosition}
          />
          <div className="flex flex-col justify-center">
            <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Our story</p>
            <EditableText
              value={settings.tagline}
              onChange={(value) => patchSettings("tagline", value)}
              className="landing-serif mt-4 text-3xl lg:text-4xl"
            />
            <EditableText
              value={settings.aboutStory}
              onChange={(value) => patchSettings("aboutStory", value)}
              multiline
              className="mt-6 text-base leading-relaxed text-white/70"
            />
            <EditableText
              value={settings.description}
              onChange={(value) => patchSettings("description", value)}
              multiline
              className="mt-4 text-base leading-relaxed text-white/60"
            />
          </div>
        </section>

        {/* Signatures */}
        <section className="bg-[#0B0B0C] px-8 py-16 lg:px-14">
          <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Signature</p>
          <h2 className="landing-serif mt-3 text-3xl">Fire & flavour</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {(["signature_1", "signature_2", "signature_3"] as const).map((slot) => (
              <DraggableMedia
                key={slot}
                slot={slot}
                url={media[slot]?.fileUrl}
                objectPosition={media[slot]?.objectPosition}
                className="aspect-square w-full"
                onPositionSaved={savePosition}
              />
            ))}
          </div>
        </section>

        {/* Contact strip */}
        <section className="border-t border-white/10 bg-[#141416] px-8 py-10 lg:px-14">
          <EditableText
            value={settings.address}
            onChange={(value) => patchSettings("address", value)}
            className="text-sm text-white/70"
          />
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-white/70">
            <EditableText
              value={settings.phone}
              onChange={(value) => patchSettings("phone", value)}
            />
            <EditableText
              value={settings.email}
              onChange={(value) => patchSettings("email", value)}
            />
          </div>
        </section>
      </div>

      <p className="text-xs text-gray-500">
        Tip: image drag saves automatically. Text edits need the green <strong>Save text</strong> button.
        Run <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">patch-website-media-position.sql</code> if
        position save fails.
      </p>
    </div>
  );
}
