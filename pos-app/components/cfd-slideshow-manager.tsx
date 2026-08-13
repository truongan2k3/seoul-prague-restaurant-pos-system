"use client";

import { useCallback, useRef, useState } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Film, GripVertical, ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { CFD_IMAGE_DEFAULT_SECONDS, inferCfdMediaType } from "@/lib/cfd-slideshow";
import type { CfdSlideshowItem } from "@/lib/types";
import { uploadCfdSlideshowMedia } from "@/src/lib/settings-actions";

function mediaIcon(type: CfdSlideshowItem["type"]) {
  if (type === "video") return Film;
  return ImageIcon;
}

function reorderSlides(items: CfdSlideshowItem[], source: number, destination: number) {
  if (source === destination) return items;
  const next = [...items];
  const [moved] = next.splice(source, 1);
  next.splice(destination, 0, moved);
  return next;
}

export function CfdSlideshowManager({ embedded = false }: { embedded?: boolean }) {
  const { translate } = useApp();
  const { settings, saveSettings, saving } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const slides = settings.cfdAdSlideshow;

  const persist = useCallback(
    async (next: CfdSlideshowItem[]) => {
      setError(null);
      const ok = await saveSettings({
        cfdAdSlideshow: next,
        ...(next.length > 0 ? { cfdAdVideoUrl: "" } : {}),
      });
      if (!ok) setError(translate("saveFailed"));
    },
    [saveSettings, translate],
  );

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    const added: CfdSlideshowItem[] = [];
    for (const file of Array.from(files)) {
      const { data: url, error: uploadError } = await uploadCfdSlideshowMedia(file);
      if (uploadError || !url) {
        setError(uploadError?.message ?? translate("uploadFailed"));
        continue;
      }
      const type = inferCfdMediaType(url);
      added.push({
        id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url,
        type,
        durationSeconds:
          type === "image" || type === "gif" ? CFD_IMAGE_DEFAULT_SECONDS : undefined,
      });
    }

    setUploading(false);
    if (added.length === 0) return;
    await persist([...slides, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    void persist(reorderSlides(slides, result.source.index, result.destination.index));
  };

  const updateDuration = (id: string, seconds: number) => {
    void persist(
      slides.map((slide) =>
        slide.id === id ? { ...slide, durationSeconds: Math.max(1, seconds) } : slide,
      ),
    );
  };

  const removeSlide = (id: string) => {
    void persist(slides.filter((slide) => slide.id !== id));
  };

  return (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {translate("settingsCfdAdVideo")}
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {translate("storageDisplayMediaHint")}
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,image/png,image/jpeg,image/webp,image/gif,.gif"
          multiple
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <button
          type="button"
          disabled={uploading || saving}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {uploading ? (
            translate("uploading")
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {translate("storageDisplayMediaUpload")}
            </>
          )}
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {translate("storageDisplayMediaFormats")}
        </span>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {slides.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {settings.cfdAdVideoUrl.trim()
              ? translate("storageDisplayMediaLegacyHint")
              : translate("storageDisplayMediaEmpty")}
          </p>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="cfd-slideshow">
              {(provided) => (
                <ul
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="divide-y divide-gray-100 dark:divide-gray-700"
                >
                  {slides.map((slide, index) => {
                    const Icon = mediaIcon(slide.type);
                    const showDuration = slide.type === "image" || slide.type === "gif";
                    return (
                      <Draggable key={slide.id} draggableId={slide.id} index={index}>
                        {(dragProvided, snapshot) => (
                          <li
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                              snapshot.isDragging ? "bg-gray-50 shadow-lg dark:bg-gray-900" : ""
                            }`}
                          >
                            <button
                              type="button"
                              {...dragProvided.dragHandleProps}
                              className="cursor-grab rounded p-1 text-gray-400 hover:text-gray-700 active:cursor-grabbing dark:hover:text-gray-200"
                              aria-label={translate("dragToReorder")}
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                            <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-black dark:border-gray-600">
                              {slide.type === "video" ? (
                                <video
                                  src={slide.url}
                                  muted
                                  playsInline
                                  className="max-h-full max-w-full object-contain"
                                />
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={slide.url}
                                  alt=""
                                  className="max-h-full max-w-full object-contain"
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                                <Icon className="h-4 w-4 shrink-0 text-gray-400" />
                                {slide.type === "video"
                                  ? translate("storageDisplayMediaVideo")
                                  : slide.type === "gif"
                                    ? "GIF"
                                    : translate("storageDisplayMediaImage")}
                              </p>
                              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                {slide.url.split("/").pop()}
                              </p>
                            </div>
                            {showDuration ? (
                              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                                {translate("storageDisplayMediaDuration")}
                                <input
                                  type="number"
                                  min={1}
                                  max={120}
                                  value={slide.durationSeconds ?? CFD_IMAGE_DEFAULT_SECONDS}
                                  disabled={saving}
                                  onChange={(event) =>
                                    updateDuration(slide.id, Number(event.target.value) || 12)
                                  }
                                  className="w-16 rounded border border-gray-200 px-2 py-1 dark:border-gray-600 dark:bg-gray-900"
                                />
                                s
                              </label>
                            ) : (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {translate("storageDisplayMediaVideoLoop")}
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => removeSlide(slide.id)}
                              className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
                              aria-label={translate("delete")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      {slides.length > 1 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <Plus className="mr-1 inline h-3 w-3" />
          {translate("storageDisplayMediaOrderHint")}
        </p>
      ) : null}
    </div>
  );
}
