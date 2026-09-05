"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  Eye,
  EyeOff,
  GripVertical,
  Maximize2,
  Minimize2,
  Monitor,
  Move,
  Plus,
  Save,
  Smartphone,
  Trash2,
} from "lucide-react";
import { DesignerDeviceFrame } from "@/components/admin/website/designer-device-frame";
import {
  InlinePlusUpload,
  uploadWebsiteGalleryFile,
  uploadWebsiteSlotFile,
  uploadWebsiteVideoApiFile,
} from "@/components/admin/website/inline-plus-upload";
import {
  ADDABLE_SECTION_TYPES,
  BUILTIN_SECTION_TYPES,
  SECTION_LABELS,
  bodyClassForSection,
  createPageSection,
  headlineClassForSection,
  isSectionVisible,
  normalizePageLayout,
  normalizePromoSlideshows,
  paddingClassForSection,
} from "@/lib/website/page-layout";
import type {
  WebsiteAmenity,
  WebsiteContent,
  WebsiteDevice,
  WebsiteGalleryItem,
  WebsiteMediaSlot,
  WebsiteMenuCategory,
  WebsiteMenuItem,
  WebsiteMenuPdf,
  WebsitePageSection,
  WebsitePromoSlide,
  WebsitePromoSlideshow,
  WebsiteSettings,
  WebsiteSectionType,
  WebsiteVideo,
} from "@/lib/website/types";
import {
  saveWebsiteSettings,
  updateWebsiteMediaObjectPosition,
} from "@/src/lib/website-actions";
import {
  AmenitiesDesignerPanel,
  DesignerAmenitiesCanvasPreview,
  DesignerMenuCanvasPreview,
  MenuDesignerPanel,
} from "@/components/admin/website/designer-section-editors";

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
  onUploaded,
  onError,
}: {
  slot: WebsiteMediaSlot;
  url?: string;
  objectPosition?: string;
  className?: string;
  onPositionSaved: (slot: WebsiteMediaSlot, position: string) => void;
  onUploaded: (slot: WebsiteMediaSlot, asset: NonNullable<WebsiteContent["media"][WebsiteMediaSlot]>) => void;
  onError: (message: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(
    null,
  );
  const [position, setPosition] = useState(objectPosition ?? "50% 50%");

  useEffect(() => {
    setPosition(objectPosition ?? "50% 50%");
  }, [objectPosition, url]);

  const accept =
    slot === "hero_video" ? "video/mp4,video/webm" : "image/png,image/jpeg,image/webp,image/svg+xml";

  const handleUpload = async (file: File) => {
    const result = await uploadWebsiteSlotFile(slot, file, slot.replaceAll("_", " "));
    if (result.error || !result.data) {
      onError(result.error || "Upload failed.");
      return;
    }
    onUploaded(slot, result.data);
  };

  const parse = (value: string) => {
    const parts = value.split(/\s+/);
    return {
      x: Number.parseFloat(parts[0] ?? "50") || 50,
      y: Number.parseFloat(parts[1] ?? "50") || 50,
    };
  };

  if (!url) {
    return (
      <div
        className={`relative flex flex-col items-center justify-center gap-3 bg-[#1a1a1c] text-sm text-white/50 ${className}`}
      >
        <p>No media yet</p>
        <InlinePlusUpload accept={accept} label="Add file" onFile={handleUpload} />
      </div>
    );
  }

  return (
    <div ref={frameRef} className={`group relative overflow-hidden ${className}`}>
      {slot === "hero_video" ? (
        <video src={url} className="h-full w-full object-cover" muted playsInline autoPlay loop />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
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
      )}
      <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/55 px-2 py-1 text-[10px] uppercase tracking-wide text-white">
        <Move className="h-3 w-3" /> Drag image
      </span>
      <div className="absolute right-2 top-2 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100">
        <InlinePlusUpload accept={accept} hasMedia onFile={handleUpload} />
      </div>
    </div>
  );
}

function newSlideId() {
  return `slide-${Math.random().toString(36).slice(2, 9)}`;
}

export function WebsiteVisualDesigner({ initial }: { initial: WebsiteContent }) {
  const router = useRouter();
  const [settings, setSettings] = useState<WebsiteSettings>({
    ...initial.settings,
    pageLayout: normalizePageLayout(initial.settings.pageLayout),
    promoSlideshows: normalizePromoSlideshows(initial.settings.promoSlideshows),
  });
  const [media, setMedia] = useState(initial.media);
  const [gallery, setGallery] = useState<WebsiteGalleryItem[]>(initial.gallery);
  const [videos, setVideos] = useState<WebsiteVideo[]>(initial.videos);
  const [amenities, setAmenities] = useState<WebsiteAmenity[]>(initial.amenities);
  const [menuCategories, setMenuCategories] = useState<WebsiteMenuCategory[]>(
    initial.menuCategories,
  );
  const [menuItems, setMenuItems] = useState<WebsiteMenuItem[]>(initial.menuItems);
  const [menuPdfs, setMenuPdfs] = useState<WebsiteMenuPdf[]>(initial.menuPdfs);
  const [device, setDevice] = useState<WebsiteDevice>("desktop");
  const [zoom, setZoom] = useState(100);
  const [focusCanvas, setFocusCanvas] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => normalizePageLayout(initial.settings.pageLayout)[0]?.id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const layout = settings.pageLayout;
  const selected = layout.find((section) => section.id === selectedId) ?? null;

  const patchSettings = <K extends keyof WebsiteSettings>(key: K, value: WebsiteSettings[K]) => {
    dirtyRef.current = true;
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateLayout = (next: WebsitePageSection[]) => {
    dirtyRef.current = true;
    setSettings((prev) => ({
      ...prev,
      pageLayout: next.map((section, index) => ({ ...section, sortOrder: index })),
    }));
  };

  const patchSection = (id: string, updater: (section: WebsitePageSection) => WebsitePageSection) => {
    updateLayout(layout.map((section) => (section.id === id ? updater(section) : section)));
  };

  const updateSlideshows = (next: WebsitePromoSlideshow[]) => {
    dirtyRef.current = true;
    setSettings((prev) => ({ ...prev, promoSlideshows: next }));
  };

  const saveAll = async () => {
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
      pageLayout: settings.pageLayout,
      promoSlideshows: settings.promoSlideshows,
    });
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    dirtyRef.current = false;
    setMessage("Layout, slideshows & text saved.");
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
    if (data) setMedia((prev) => ({ ...prev, [slot]: data }));
    setMessage(`Saved position for ${slot.replaceAll("_", " ")}.`);
  };

  const handleMediaUploaded = (
    slot: WebsiteMediaSlot,
    asset: NonNullable<WebsiteContent["media"][WebsiteMediaSlot]>,
  ) => {
    setMedia((prev) => ({ ...prev, [slot]: asset }));
    setMessage(`Uploaded ${slot.replaceAll("_", " ")}.`);
    setError(null);
  };

  const handleGalleryUpload = async (file: File) => {
    setError(null);
    const result = await uploadWebsiteGalleryFile(file);
    if (result.error || !result.data) {
      setError(result.error || "Gallery upload failed.");
      return;
    }
    setGallery((prev) => [
      {
        id: result.data!.id,
        category: "food",
        title: result.data!.title,
        imageUrl: result.data!.imageUrl,
        sortOrder: Date.now(),
        featured: false,
      },
      ...prev,
    ]);
    setMessage("Gallery image added.");
  };

  const handleVideoUpload = async (file: File) => {
    setError(null);
    const result = await uploadWebsiteVideoApiFile(file, file.name.replace(/\.[^.]+$/, ""), "promo");
    if (result.error || !result.data) {
      setError(result.error || "Video upload failed.");
      return;
    }
    setVideos((prev) => [
      {
        id: result.data!.id,
        title: result.data!.title,
        description: "",
        videoUrl: result.data!.videoUrl,
        posterUrl: result.data!.posterUrl || "",
        slot: "promo",
        sortOrder: Date.now(),
        enabled: true,
      },
      ...prev,
    ]);
    setMessage("Video added.");
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const next = [...layout];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    updateLayout(next);
  };

  const addSection = (type: WebsiteSectionType) => {
    const section = createPageSection(type);
    updateLayout([...layout, section]);
    setSelectedId(section.id);
  };

  const removeSection = (id: string) => {
    const target = layout.find((section) => section.id === id);
    if (!target) return;
    if (BUILTIN_SECTION_TYPES.includes(target.type) && target.type !== "promo_slideshow") {
      setError("Core sections can be hidden, not deleted. Toggle visibility instead.");
      return;
    }
    const next = layout.filter((section) => section.id !== id);
    updateLayout(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const deviceStyleKey = device === "mobile" ? "mobile" : "desktop";

  const activeSlideshow = useMemo(() => {
    const id = selected?.props?.slideshowId ?? "promo-main";
    return settings.promoSlideshows.find((entry) => entry.id === id) ?? settings.promoSlideshows[0];
  }, [selected, settings.promoSlideshows]);

  const galleryOptions = gallery;

  useEffect(() => {
    setZoom(device === "mobile" ? 90 : 85);
  }, [device]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#e8e8eb] dark:bg-[#121214]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-white/90 px-4 py-2.5 backdrop-blur dark:border-white/10 dark:bg-[#1a1a1c]/95">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Homepage canvas</p>
          <p className="truncate text-xs text-gray-500">
            Edit everything here — tap + on any image/video to upload
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => setDevice("desktop")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                device === "desktop"
                  ? "bg-white text-gray-900 shadow-sm dark:bg-gray-100 dark:text-gray-900"
                  : "text-gray-500"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" /> Desktop
            </button>
            <button
              type="button"
              onClick={() => setDevice("mobile")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                device === "mobile"
                  ? "bg-white text-gray-900 shadow-sm dark:bg-gray-100 dark:text-gray-900"
                  : "text-gray-500"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" /> Mobile
            </button>
          </div>

          <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900">
            <button
              type="button"
              className="rounded px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
            >
              −
            </button>
            <span className="min-w-[3rem] text-center tabular-nums text-gray-600 dark:text-gray-300">
              {zoom}%
            </span>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => setZoom((z) => Math.min(120, z + 10))}
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={() => setFocusCanvas((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium dark:border-gray-700 dark:bg-gray-900"
            title={focusCanvas ? "Show panels" : "Focus canvas"}
          >
            {focusCanvas ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {focusCanvas ? "Panels" : "Focus"}
          </button>

          <Link
            href="/"
            target="_blank"
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium dark:border-gray-700 dark:bg-gray-900"
          >
            Live ↗
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveAll()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      </header>

      {error ? (
        <p className="shrink-0 bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="shrink-0 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          {message}
        </p>
      ) : null}

      <div
        className={`grid min-h-0 flex-1 items-stretch ${
          focusCanvas
            ? "grid-cols-1"
            : "grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_280px]"
        }`}
      >
        {/* Sections */}
        <aside
          className={`min-h-0 overflow-y-auto border-r border-black/10 bg-white p-3 dark:border-white/10 dark:bg-[#1a1a1c] ${
            focusCanvas ? "hidden lg:hidden" : "hidden lg:block"
          }`}
        >
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Page sections
          </p>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="page-sections">
              {(provided) => (
                <ul ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                  {layout.map((section, index) => (
                    <Draggable key={section.id} draggableId={section.id} index={index}>
                      {(dragProvided) => (
                        <li
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={`flex items-center gap-1 rounded-xl border px-2 py-2 text-sm ${
                            selectedId === section.id
                              ? "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30"
                              : "border-gray-200 dark:border-gray-700"
                          }`}
                        >
                          <button
                            type="button"
                            className="cursor-grab text-gray-400 active:cursor-grabbing"
                            {...dragProvided.dragHandleProps}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left font-medium"
                            onClick={() => setSelectedId(section.id)}
                          >
                            {SECTION_LABELS[section.type]}
                          </button>
                          <button
                            type="button"
                            title={section.enabled ? "Disable" : "Enable"}
                            onClick={() =>
                              patchSection(section.id, (current) => ({
                                ...current,
                                enabled: !current.enabled,
                              }))
                            }
                            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            {section.enabled ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>

          <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Add component
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {ADDABLE_SECTION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addSection(type)}
                  className="inline-flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-left text-sm hover:border-emerald-500 hover:bg-emerald-50 dark:border-gray-600 dark:hover:bg-emerald-950/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {SECTION_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Canvas */}
        <div
          className="relative min-h-0 overflow-auto dark:[background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.14) 1px, transparent 0)",
            backgroundSize: "18px 18px",
          }}
        >
          <div className="flex min-h-full justify-center px-4 py-8 lg:px-8 lg:py-10">
            <DesignerDeviceFrame device={device} zoom={zoom}>
              <div className="bg-[#0B0B0C] text-white">
            {layout.map((section) => {
              if (!isSectionVisible(section, device)) return null;
              const selectedRing =
                selectedId === section.id ? "ring-2 ring-[#C9A88B] ring-offset-2 ring-offset-[#0B0B0C]" : "";
              const headline = headlineClassForSection(section, device);
              const body = bodyClassForSection(section, device);
              const pad = paddingClassForSection(section, device);

              if (section.type === "hero") {
                return (
                  <section
                    key={section.id}
                    onClick={() => setSelectedId(section.id)}
                    className={`relative min-h-[70vh] cursor-pointer overflow-hidden ${selectedRing}`}
                  >
                    <DraggableMedia
                      slot="hero_image"
                      url={media.hero_image?.fileUrl}
                      objectPosition={media.hero_image?.objectPosition}
                      className="absolute inset-0"
                      onPositionSaved={savePosition}
                      onUploaded={handleMediaUploaded}
                      onError={setError}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0C] via-[#0B0B0C]/65 to-black/25" />
                    <div className="absolute right-3 top-3 z-20 flex flex-wrap gap-2">
                      <InlinePlusUpload
                        accept="video/mp4,video/webm"
                        label={media.hero_video ? "Replace video" : "Add video"}
                        hasMedia={Boolean(media.hero_video)}
                        onFile={async (file) => {
                          const result = await uploadWebsiteSlotFile("hero_video", file, "Hero video");
                          if (result.error || !result.data) {
                            setError(result.error || "Video upload failed.");
                            return;
                          }
                          handleMediaUploaded("hero_video", result.data);
                        }}
                      />
                    </div>
                    <div className="relative z-10 flex min-h-[70vh] flex-col justify-end px-6 pb-12 pt-20">
                      <EditableText
                        value={settings.restaurantName}
                        onChange={(value) => patchSettings("restaurantName", value)}
                        className="mb-3 text-xs uppercase tracking-[0.35em] text-[#C9A88B]"
                      />
                      <EditableText
                        value={settings.heroHeadline}
                        onChange={(value) => patchSettings("heroHeadline", value)}
                        className={`landing-serif max-w-4xl font-medium leading-tight ${headline}`}
                      />
                      <EditableText
                        value={settings.heroTagline}
                        onChange={(value) => patchSettings("heroTagline", value)}
                        className={`mt-4 max-w-xl text-white/80 ${body}`}
                      />
                      <EditableText
                        value={settings.heroDescription}
                        onChange={(value) => patchSettings("heroDescription", value)}
                        multiline
                        className="mt-3 max-w-2xl text-sm text-white/60"
                      />
                    </div>
                  </section>
                );
              }

              if (section.type === "promo_slideshow") {
                const slides =
                  settings.promoSlideshows
                    .find((entry) => entry.id === (section.props?.slideshowId ?? "promo-main"))
                    ?.slides.filter((slide) => slide.enabled) ?? [];
                const slide = slides[0];
                return (
                  <section
                    key={section.id}
                    onClick={() => setSelectedId(section.id)}
                    className={`relative cursor-pointer overflow-hidden bg-[#120e0f] ${pad} ${selectedRing}`}
                  >
                    {slide?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={slide.imageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover opacity-50"
                      />
                    ) : null}
                    <div className="relative z-10 px-6">
                      <p className="text-xs uppercase tracking-[0.35em] text-[#C9A88B]">
                        {section.props?.eyebrow || "Events"}
                      </p>
                      <h2 className={`landing-serif mt-3 ${headline}`}>
                        {slide?.title || "Add event slides →"}
                      </h2>
                      <p className={`mt-3 text-white/70 ${body}`}>
                        {slide?.subtitle || "Create promotional slides in the inspector."}
                      </p>
                      <p className="mt-4 text-[11px] uppercase tracking-wide text-white/40">
                        {slides.length} slide{slides.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </section>
                );
              }

              if (section.type === "about") {
                return (
                  <section
                    key={section.id}
                    onClick={() => setSelectedId(section.id)}
                    className={`grid cursor-pointer gap-6 bg-[#0F0F10] px-6 ${pad} ${selectedRing} ${
                      device === "desktop" ? "grid-cols-2" : ""
                    }`}
                  >
                    <DraggableMedia
                      slot="about_image"
                      url={media.about_image?.fileUrl}
                      objectPosition={media.about_image?.objectPosition}
                      className="aspect-[3/4] w-full"
                      onPositionSaved={savePosition}
                      onUploaded={handleMediaUploaded}
                      onError={setError}
                    />
                    <div className="flex flex-col justify-center">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Our story</p>
                      <EditableText
                        value={settings.tagline}
                        onChange={(value) => patchSettings("tagline", value)}
                        className={`landing-serif mt-4 ${headline}`}
                      />
                      <EditableText
                        value={settings.aboutStory}
                        onChange={(value) => patchSettings("aboutStory", value)}
                        multiline
                        className={`mt-6 leading-relaxed text-white/70 ${body}`}
                      />
                    </div>
                  </section>
                );
              }

              if (section.type === "signature") {
                return (
                  <section
                    key={section.id}
                    onClick={() => setSelectedId(section.id)}
                    className={`cursor-pointer bg-[#0B0B0C] px-6 ${pad} ${selectedRing}`}
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Signature</p>
                    <h2 className={`landing-serif mt-3 ${headline}`}>Fire & flavour</h2>
                    <div
                      className={`mt-6 grid gap-3 ${device === "desktop" ? "grid-cols-3" : "grid-cols-1"}`}
                    >
                      {(["signature_1", "signature_2", "signature_3"] as const).map((slot) => (
                        <DraggableMedia
                          key={slot}
                          slot={slot}
                          url={media[slot]?.fileUrl}
                          objectPosition={media[slot]?.objectPosition}
                          className="aspect-square w-full"
                          onPositionSaved={savePosition}
                          onUploaded={handleMediaUploaded}
                          onError={setError}
                        />
                      ))}
                    </div>
                  </section>
                );
              }

              if (section.type === "custom_text" || section.type === "custom_cta" || section.type === "experience") {
                return (
                  <section
                    key={section.id}
                    onClick={() => setSelectedId(section.id)}
                    className={`cursor-pointer bg-[#141416] px-6 ${pad} ${selectedRing}`}
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">
                      {section.props?.eyebrow || SECTION_LABELS[section.type]}
                    </p>
                    <h2 className={`landing-serif mt-3 ${headline}`}>
                      {section.props?.headline || SECTION_LABELS[section.type]}
                    </h2>
                    <p className={`mt-3 text-white/70 ${body}`}>
                      {section.props?.body || "Edit copy in the inspector."}
                    </p>
                    {section.type === "custom_cta" ? (
                      <span className="mt-5 inline-flex rounded-full bg-[#C9A88B] px-4 py-2 text-sm font-semibold text-[#1a1210]">
                        {section.props?.ctaLabel || "CTA"}
                      </span>
                    ) : null}
                  </section>
                );
              }

              if (section.type === "spacer") {
                return (
                  <section
                    key={section.id}
                    onClick={() => setSelectedId(section.id)}
                    className={`cursor-pointer border border-dashed border-white/15 bg-[#0B0B0C] px-6 py-8 text-center text-xs uppercase tracking-wide text-white/35 ${selectedRing}`}
                  >
                    Spacer
                  </section>
                );
              }

              return (
                <section
                  key={section.id}
                  onClick={() => setSelectedId(section.id)}
                  className={`cursor-pointer border-t border-white/10 bg-[#101012] px-6 py-10 ${selectedRing}`}
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">
                      {SECTION_LABELS[section.type]}
                    </p>
                    {section.type === "gallery" ? (
                      <InlinePlusUpload
                        accept="image/png,image/jpeg,image/webp"
                        label="Add image"
                        onFile={handleGalleryUpload}
                      />
                    ) : null}
                    {section.type === "video" ? (
                      <InlinePlusUpload
                        accept="video/mp4,video/webm"
                        label="Add video"
                        onFile={handleVideoUpload}
                      />
                    ) : null}
                  </div>

                  {section.type === "gallery" ? (
                    <div
                      className={`grid gap-2 ${device === "desktop" ? "grid-cols-3" : "grid-cols-2"}`}
                    >
                      {gallery.slice(0, 6).map((item) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={item.id}
                          src={item.imageUrl}
                          alt={item.title}
                          className="aspect-square w-full object-cover"
                        />
                      ))}
                      {gallery.length === 0 ? (
                        <p className="col-span-full text-sm text-white/50">
                          Tap + to add gallery photos here.
                        </p>
                      ) : null}
                    </div>
                  ) : section.type === "video" ? (
                    <div className="space-y-3">
                      {videos.filter((v) => v.enabled).slice(0, 2).map((video) => (
                        <div key={video.id} className="overflow-hidden rounded-xl bg-black/40">
                          <video
                            src={video.videoUrl}
                            poster={video.posterUrl || undefined}
                            controls
                            className="max-h-56 w-full"
                          />
                          <p className="px-3 py-2 text-sm text-white/70">{video.title}</p>
                        </div>
                      ))}
                      {videos.length === 0 ? (
                        <p className="text-sm text-white/50">Tap + to add a promo video here.</p>
                      ) : null}
                    </div>
                  ) : section.type === "menu" ? (
                    <DesignerMenuCanvasPreview
                      categories={menuCategories}
                      items={menuItems}
                      menuPdfs={menuPdfs}
                      bodyClass={body}
                    />
                  ) : section.type === "amenities" ? (
                    <DesignerAmenitiesCanvasPreview amenities={amenities} bodyClass={body} />
                  ) : (
                    <p className={`mt-3 text-white/70 ${body}`}>
                      Content syncs from the live site settings for this block.
                    </p>
                  )}
                </section>
              );
            })}

            <section className="border-t border-white/10 bg-[#141416] px-6 py-8">
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
            </DesignerDeviceFrame>
          </div>
        </div>

        {/* Inspector */}
        <aside
          className={`min-h-0 space-y-3 overflow-y-auto border-l border-black/10 bg-white p-3 dark:border-white/10 dark:bg-[#1a1a1c] ${
            focusCanvas ? "hidden lg:hidden" : "hidden lg:block"
          }`}
        >
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Inspector · {device === "mobile" ? "Phone" : "Desktop"}
          </p>
          {!selected ? (
            <p className="px-1 text-sm text-gray-500">Select a section to edit.</p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
                <p className="text-sm font-semibold">{SECTION_LABELS[selected.type]}</p>
                <p className="mt-1 text-xs text-gray-500">Styles below apply to {device} only.</p>
              </div>

              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Headline size
                <select
                  className="pos-input mt-1"
                  value={selected[deviceStyleKey]?.typeScale?.headline ?? "lg"}
                  onChange={(event) => {
                    const headline = event.target.value as "sm" | "md" | "lg" | "xl" | "2xl";
                    patchSection(selected.id, (current) => ({
                      ...current,
                      [deviceStyleKey]: {
                        ...current[deviceStyleKey],
                        typeScale: {
                          ...current[deviceStyleKey]?.typeScale,
                          headline,
                        },
                      },
                    }));
                  }}
                >
                  {(["sm", "md", "lg", "xl", "2xl"] as const).map((size) => (
                    <option key={size} value={size}>
                      {size.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Body size
                <select
                  className="pos-input mt-1"
                  value={selected[deviceStyleKey]?.typeScale?.body ?? "md"}
                  onChange={(event) =>
                    patchSection(selected.id, (current) => ({
                      ...current,
                      [deviceStyleKey]: {
                        ...current[deviceStyleKey],
                        typeScale: {
                          ...current[deviceStyleKey]?.typeScale,
                          body: event.target.value as "sm" | "md" | "lg",
                        },
                      },
                    }))
                  }
                >
                  {(["sm", "md", "lg"] as const).map((size) => (
                    <option key={size} value={size}>
                      {size.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Vertical padding
                <select
                  className="pos-input mt-1"
                  value={selected[deviceStyleKey]?.padding ?? "normal"}
                  onChange={(event) =>
                    patchSection(selected.id, (current) => ({
                      ...current,
                      [deviceStyleKey]: {
                        ...current[deviceStyleKey],
                        padding: event.target.value as "compact" | "normal" | "spacious",
                      },
                    }))
                  }
                >
                  <option value="compact">Compact</option>
                  <option value="normal">Normal</option>
                  <option value="spacious">Spacious</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(selected[deviceStyleKey]?.hidden)}
                  onChange={(event) =>
                    patchSection(selected.id, (current) => ({
                      ...current,
                      [deviceStyleKey]: {
                        ...current[deviceStyleKey],
                        hidden: event.target.checked,
                      },
                    }))
                  }
                />
                Hide on {device}
              </label>

              {selected.type === "amenities" ? (
                <AmenitiesDesignerPanel amenities={amenities} onChange={setAmenities} />
              ) : null}

              {selected.type === "menu" ? (
                <MenuDesignerPanel
                  categories={menuCategories}
                  items={menuItems}
                  menuPdfs={menuPdfs}
                  onCategoriesChange={setMenuCategories}
                  onItemsChange={setMenuItems}
                  onMenuPdfsChange={setMenuPdfs}
                />
              ) : null}

              {(selected.type === "custom_text" ||
                selected.type === "custom_cta" ||
                selected.type === "experience" ||
                selected.type === "promo_slideshow") && (
                <div className="space-y-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                  {(["eyebrow", "headline", "body"] as const).map((field) => (
                    <label
                      key={field}
                      className="block text-xs font-medium capitalize text-gray-600 dark:text-gray-300"
                    >
                      {field}
                      {field === "body" ? (
                        <textarea
                          className="pos-input mt-1"
                          rows={3}
                          value={selected.props?.[field] ?? ""}
                          onChange={(event) =>
                            patchSection(selected.id, (current) => ({
                              ...current,
                              props: { ...current.props, [field]: event.target.value },
                            }))
                          }
                        />
                      ) : (
                        <input
                          className="pos-input mt-1"
                          value={selected.props?.[field] ?? ""}
                          onChange={(event) =>
                            patchSection(selected.id, (current) => ({
                              ...current,
                              props: { ...current.props, [field]: event.target.value },
                            }))
                          }
                        />
                      )}
                    </label>
                  ))}
                  {selected.type === "custom_cta" ? (
                    <>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                        CTA label
                        <input
                          className="pos-input mt-1"
                          value={selected.props?.ctaLabel ?? ""}
                          onChange={(event) =>
                            patchSection(selected.id, (current) => ({
                              ...current,
                              props: { ...current.props, ctaLabel: event.target.value },
                            }))
                          }
                        />
                      </label>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                        CTA link
                        <input
                          className="pos-input mt-1"
                          value={selected.props?.ctaHref ?? ""}
                          onChange={(event) =>
                            patchSection(selected.id, (current) => ({
                              ...current,
                              props: { ...current.props, ctaHref: event.target.value },
                            }))
                          }
                        />
                      </label>
                    </>
                  ) : null}
                </div>
              )}

              {selected.type === "promo_slideshow" && activeSlideshow ? (
                <div className="space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Event slides
                    </p>
                    <InlinePlusUpload
                      accept="image/png,image/jpeg,image/webp"
                      label="Slide"
                      className="!border-gray-300 !bg-gray-900 !text-white dark:!bg-gray-100 dark:!text-gray-900"
                      onFile={async (file) => {
                        const result = await uploadWebsiteGalleryFile(file, "Event slide", "events");
                        if (result.error || !result.data) {
                          setError(result.error || "Slide image upload failed.");
                          return;
                        }
                        setGallery((prev) => [
                          {
                            id: result.data!.id,
                            category: "events",
                            title: result.data!.title,
                            imageUrl: result.data!.imageUrl,
                            sortOrder: Date.now(),
                            featured: false,
                          },
                          ...prev,
                        ]);
                        const slide: WebsitePromoSlide = {
                          id: newSlideId(),
                          title: "New event",
                          subtitle: "Describe the occasion…",
                          imageUrl: result.data!.imageUrl,
                          ctaLabel: "Reserve",
                          ctaHref: "/reservation",
                          enabled: true,
                          sortOrder: activeSlideshow.slides.length,
                        };
                        updateSlideshows(
                          settings.promoSlideshows.map((entry) =>
                            entry.id === activeSlideshow.id
                              ? { ...entry, slides: [...entry.slides, slide] }
                              : entry,
                          ),
                        );
                        setMessage("Event slide added.");
                      }}
                    />
                  </div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                    Autoplay (ms)
                    <input
                      type="number"
                      min={2000}
                      step={200}
                      className="pos-input mt-1"
                      value={activeSlideshow.autoplayMs}
                      onChange={(event) =>
                        updateSlideshows(
                          settings.promoSlideshows.map((entry) =>
                            entry.id === activeSlideshow.id
                              ? {
                                  ...entry,
                                  autoplayMs: Math.max(2000, Number(event.target.value) || 5200),
                                }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="max-h-[360px] space-y-3 overflow-y-auto">
                    {activeSlideshow.slides.map((slide) => (
                      <div
                        key={slide.id}
                        className="space-y-2 rounded-xl border border-gray-200 p-2 dark:border-gray-700"
                      >
                        <input
                          className="pos-input"
                          placeholder="Title"
                          value={slide.title}
                          onChange={(event) =>
                            updateSlideshows(
                              settings.promoSlideshows.map((entry) =>
                                entry.id === activeSlideshow.id
                                  ? {
                                      ...entry,
                                      slides: entry.slides.map((row) =>
                                        row.id === slide.id
                                          ? { ...row, title: event.target.value }
                                          : row,
                                      ),
                                    }
                                  : entry,
                              ),
                            )
                          }
                        />
                        <textarea
                          className="pos-input"
                          rows={2}
                          placeholder="Subtitle"
                          value={slide.subtitle}
                          onChange={(event) =>
                            updateSlideshows(
                              settings.promoSlideshows.map((entry) =>
                                entry.id === activeSlideshow.id
                                  ? {
                                      ...entry,
                                      slides: entry.slides.map((row) =>
                                        row.id === slide.id
                                          ? { ...row, subtitle: event.target.value }
                                          : row,
                                      ),
                                    }
                                  : entry,
                              ),
                            )
                          }
                        />
                        <label className="block text-xs text-gray-500">
                          Image from gallery
                          <select
                            className="pos-input mt-1"
                            value={slide.imageUrl}
                            onChange={(event) =>
                              updateSlideshows(
                                settings.promoSlideshows.map((entry) =>
                                  entry.id === activeSlideshow.id
                                    ? {
                                        ...entry,
                                        slides: entry.slides.map((row) =>
                                          row.id === slide.id
                                            ? { ...row, imageUrl: event.target.value }
                                            : row,
                                        ),
                                      }
                                    : entry,
                                ),
                              )
                            }
                          >
                            <option value="">— choose —</option>
                            {galleryOptions.map((item) => (
                              <option key={item.id} value={item.imageUrl}>
                                {item.title || item.imageUrl.slice(-24)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <input
                          className="pos-input"
                          placeholder="Or paste image URL"
                          value={slide.imageUrl}
                          onChange={(event) =>
                            updateSlideshows(
                              settings.promoSlideshows.map((entry) =>
                                entry.id === activeSlideshow.id
                                  ? {
                                      ...entry,
                                      slides: entry.slides.map((row) =>
                                        row.id === slide.id
                                          ? { ...row, imageUrl: event.target.value }
                                          : row,
                                      ),
                                    }
                                  : entry,
                              ),
                            )
                          }
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="pos-input"
                            placeholder="CTA label"
                            value={slide.ctaLabel ?? ""}
                            onChange={(event) =>
                              updateSlideshows(
                                settings.promoSlideshows.map((entry) =>
                                  entry.id === activeSlideshow.id
                                    ? {
                                        ...entry,
                                        slides: entry.slides.map((row) =>
                                          row.id === slide.id
                                            ? { ...row, ctaLabel: event.target.value }
                                            : row,
                                        ),
                                      }
                                    : entry,
                                ),
                              )
                            }
                          />
                          <input
                            className="pos-input"
                            placeholder="CTA href"
                            value={slide.ctaHref ?? ""}
                            onChange={(event) =>
                              updateSlideshows(
                                settings.promoSlideshows.map((entry) =>
                                  entry.id === activeSlideshow.id
                                    ? {
                                        ...entry,
                                        slides: entry.slides.map((row) =>
                                          row.id === slide.id
                                            ? { ...row, ctaHref: event.target.value }
                                            : row,
                                        ),
                                      }
                                    : entry,
                                ),
                              )
                            }
                          />
                        </div>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-red-600"
                          onClick={() =>
                            updateSlideshows(
                              settings.promoSlideshows.map((entry) =>
                                entry.id === activeSlideshow.id
                                  ? {
                                      ...entry,
                                      slides: entry.slides.filter((row) => row.id !== slide.id),
                                    }
                                  : entry,
                              ),
                            )
                          }
                        >
                          <Trash2 className="h-3 w-3" /> Remove slide
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {(selected.type === "promo_slideshow" ||
                selected.type === "custom_text" ||
                selected.type === "custom_cta" ||
                selected.type === "spacer") && (
                <button
                  type="button"
                  onClick={() => removeSection(selected.id)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
                >
                  <Trash2 className="h-4 w-4" /> Remove component
                </button>
              )}
            </div>
          )}
          <p className="px-1 text-[11px] leading-relaxed text-gray-500">
            Tip: run <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">patch-website-page-layout.sql</code>{" "}
            once if Save fails on missing columns.
          </p>
        </aside>
      </div>
    </div>
  );
}
