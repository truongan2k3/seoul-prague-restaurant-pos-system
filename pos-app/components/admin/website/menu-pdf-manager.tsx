"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Upload, Trash2, FileText, Loader2, GripVertical } from "lucide-react";
import { MENU_PDF_LANGUAGES } from "@/lib/website/defaults";
import { sortMenuPdfs } from "@/lib/website/menu-pdf-order";
import type { MenuPdfLanguage, WebsiteMenuPdf } from "@/lib/website/types";

async function countPdfPages(file: File): Promise<number | undefined> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    return doc.numPages;
  } catch {
    return undefined;
  }
}

interface MenuPdfManagerProps {
  initial: WebsiteMenuPdf[];
  compact?: boolean;
  onChange?: (rows: WebsiteMenuPdf[]) => void;
}

export function MenuPdfManager({ initial, compact = false, onChange }: MenuPdfManagerProps) {
  const router = useRouter();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [rows, setRows] = useState(() => sortMenuPdfs(initial));
  const [busyLang, setBusyLang] = useState<MenuPdfLanguage | null>(null);
  const [reordering, setReordering] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orderedRows = useMemo(() => sortMenuPdfs(rows), [rows]);
  const missingLanguages = MENU_PDF_LANGUAGES.filter(
    ({ code }) => !rows.some((row) => row.language === code),
  );

  const persistOrder = async (nextRows: WebsiteMenuPdf[]) => {
    setReordering(true);
    setError(null);
    try {
      const response = await fetch("/api/website/menu-pdf", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: nextRows.map((row) => row.id) }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: WebsiteMenuPdf[];
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error || "Could not save PDF order.");
        setRows(sortMenuPdfs(initial));
        return;
      }
      const sorted = sortMenuPdfs(payload.data ?? nextRows);
      setRows(sorted);
      onChange?.(sorted);
      setMessage("Menu order saved.");
      if (!compact) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save PDF order.");
      setRows(sortMenuPdfs(initial));
    } finally {
      setReordering(false);
    }
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const next = [...orderedRows];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    const withOrder = next.map((row, index) => ({ ...row, sortOrder: index }));
    setRows(withOrder);
    onChange?.(withOrder);
    void persistOrder(withOrder);
  };

  const handleUpload = async (language: MenuPdfLanguage, file: File) => {
    setBusyLang(language);
    setMessage(null);
    setError(null);
    setProgress(`Preparing ${file.name}…`);

    try {
      if (!file.name.toLowerCase().endsWith(".pdf") && file.type && !file.type.includes("pdf")) {
        setError("Only PDF files are supported.");
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        setMessage(
          `Recommended size is up to 25 MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB — uploading anyway.`,
        );
      }

      setProgress("Reading PDF pages…");
      const pageCount = await countPdfPages(file);

      setProgress(`Uploading ${(file.size / 1024 / 1024).toFixed(1)} MB…`);
      const { uploadFileDirectToStorage } = await import("@/lib/website/direct-upload");
      const uploaded = await uploadFileDirectToStorage(file, "menu-pdfs");
      if (uploaded.error || !uploaded.publicUrl || !uploaded.storagePath) {
        setError(uploaded.error || "Direct upload failed.");
        return;
      }

      const response = await fetch("/api/website/menu-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          publicUrl: uploaded.publicUrl,
          storagePath: uploaded.storagePath,
          pageCount: pageCount ?? null,
          fileSize: file.size,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        data?: WebsiteMenuPdf;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error || `Upload failed (HTTP ${response.status}).`);
        return;
      }
      if (!payload.data) {
        setError("Upload finished but no data returned.");
        return;
      }

      setRows((prev) => {
        const next = sortMenuPdfs([
          ...prev.filter((row) => row.language !== language),
          payload.data as WebsiteMenuPdf,
        ]);
        onChange?.(next);
        return next;
      });
      setMessage(
        `${MENU_PDF_LANGUAGES.find((r) => r.code === language)?.label} menu saved. Open /menu to view.`,
      );
      if (!compact) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed unexpectedly.");
    } finally {
      setBusyLang(null);
      setProgress(null);
    }
  };

  const handleDelete = async (language: MenuPdfLanguage) => {
    setBusyLang(language);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/website/menu-pdf?language=${language}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Delete failed.");
        return;
      }
      setRows((prev) => {
        const next = prev.filter((row) => row.language !== language);
        onChange?.(next);
        return next;
      });
      setMessage("PDF removed.");
      if (!compact) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusyLang(null);
    }
  };

  const renderActions = (code: MenuPdfLanguage, row?: WebsiteMenuPdf) => {
    const busy = busyLang === code;
    return (
      <div className="flex gap-2">
        <input
          ref={(el) => {
            inputRefs.current[code] = el;
          }}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleUpload(code, file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy || reordering}
          onClick={() => inputRefs.current[code]?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
        >
          <Upload className="h-4 w-4" />
          {row ? "Replace" : "Upload PDF"}
        </button>
        {row ? (
          <button
            type="button"
            disabled={busy || reordering}
            onClick={() => void handleDelete(code)}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <section
      className={
        compact
          ? "space-y-3"
          : "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
      }
    >
      {compact ? null : (
        <>
          <h2 className="text-lg font-semibold">Menu PDF books</h2>
          <p className="mt-1 text-sm text-gray-500">
            Upload one PDF per language. Drag to set the order guests see on{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">/menu</code>. English is
            first by default until you reorder.
          </p>
          <p className="mt-2 text-xs text-gray-400">PDF only · max 25 MB · recommended A4 portrait</p>
        </>
      )}

      {orderedRows.length > 0 ? (
        <div className={compact ? "space-y-2" : "mt-6 space-y-3"}>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Display order {reordering ? "· saving…" : "· drag to reorder"}
          </p>
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="menu-pdfs">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                  {orderedRows.map((row, index) => {
                    const label =
                      MENU_PDF_LANGUAGES.find((item) => item.code === row.language)?.label ??
                      row.label;
                    const busy = busyLang === row.language;
                    return (
                      <Draggable
                        key={row.id}
                        draggableId={row.id}
                        index={index}
                        isDragDisabled={reordering}
                      >
                        {(dragProvided, snapshot) => (
                          <article
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`rounded-xl border p-3 dark:border-gray-800 ${
                              snapshot.isDragging
                                ? "border-[#8B6914] bg-[#8B6914]/5 shadow-lg"
                                : "border-gray-200 bg-white dark:bg-gray-900"
                            }`}
                          >
                            <div className="flex flex-wrap items-start gap-3">
                              <button
                                type="button"
                                aria-label={`Drag to reorder ${label}`}
                                className="mt-1 cursor-grab touch-none text-gray-400 hover:text-gray-700 active:cursor-grabbing"
                                {...dragProvided.dragHandleProps}
                              >
                                <GripVertical className="h-5 w-5" />
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <h3 className="font-medium">
                                      <span className="mr-2 text-xs text-gray-400">{index + 1}.</span>
                                      {label}
                                    </h3>
                                    <p className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                                      <FileText className="h-4 w-4" />
                                      {row.pageCount ? `${row.pageCount} pages · ` : ""}
                                      {row.fileSize
                                        ? `${(row.fileSize / 1024 / 1024).toFixed(1)} MB`
                                        : "Uploaded"}
                                    </p>
                                    {busy ? (
                                      <p className="mt-2 inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {progress || "Working…"}
                                      </p>
                                    ) : null}
                                  </div>
                                  {renderActions(row.language, row)}
                                </div>
                                <a
                                  href={row.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-2 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  Preview PDF file →
                                </a>
                              </div>
                            </div>
                          </article>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      ) : null}

      {missingLanguages.length > 0 ? (
        <div className={compact ? "mt-3 space-y-2" : "mt-6 space-y-3"}>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {orderedRows.length > 0 ? "Add another language" : "Upload menu PDFs"}
          </p>
          {missingLanguages.map(({ code, label }) => {
            const busy = busyLang === code;
            return (
              <article
                key={code}
                className={
                  compact
                    ? "rounded-lg border border-dashed border-gray-300 p-2 dark:border-gray-700"
                    : "rounded-xl border border-dashed border-gray-300 p-4 dark:border-gray-700"
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{label}</h3>
                    <p className="mt-1 text-sm text-gray-400">No PDF uploaded</p>
                    {busy ? (
                      <p className="mt-2 inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {progress || "Working…"}
                      </p>
                    ) : null}
                  </div>
                  {renderActions(code)}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          {message}
        </p>
      ) : null}
    </section>
  );
}
