"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, FileText, Loader2 } from "lucide-react";
import { MENU_PDF_LANGUAGES } from "@/lib/website/defaults";
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
}

export function MenuPdfManager({ initial }: MenuPdfManagerProps) {
  const router = useRouter();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [rows, setRows] = useState(initial);
  const [busyLang, setBusyLang] = useState<MenuPdfLanguage | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getRow = (language: MenuPdfLanguage) => rows.find((row) => row.language === language);

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
        setError(null);
        setMessage(
          `Recommended size is up to 25 MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB — uploading anyway.`,
        );
      } else {
        setMessage(null);
      }
      // Soft recommendation only — do not block.

      setProgress("Reading PDF pages…");
      const pageCount = await countPdfPages(file);

      setProgress(`Uploading ${(file.size / 1024 / 1024).toFixed(1)} MB…`);
      const form = new FormData();
      form.set("language", language);
      form.set("file", file);
      if (pageCount != null) form.set("pageCount", String(pageCount));

      const response = await fetch("/api/website/menu-pdf", {
        method: "POST",
        body: form,
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
        const next = prev.filter((row) => row.language !== language);
        return [...next, payload.data as WebsiteMenuPdf];
      });
      setMessage(
        `${MENU_PDF_LANGUAGES.find((r) => r.code === language)?.label} menu saved. Open /landing/menu to view.`,
      );
      router.refresh();
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
      setRows((prev) => prev.filter((row) => row.language !== language));
      setMessage("PDF removed.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusyLang(null);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-semibold">Menu PDF books</h2>
      <p className="mt-1 text-sm text-gray-500">
        Upload one PDF per language. Guests flip through pages like a book on{" "}
        <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">/landing/menu</code>.
      </p>
      <p className="mt-2 text-xs text-gray-400">PDF only · max 25 MB · recommended A4 portrait</p>

      <div className="mt-6 space-y-4">
        {MENU_PDF_LANGUAGES.map(({ code, label }) => {
          const row = getRow(code);
          const busy = busyLang === code;
          return (
            <article
              key={code}
              className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{label}</h3>
                  {row ? (
                    <p className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                      <FileText className="h-4 w-4" />
                      {row.pageCount ? `${row.pageCount} pages · ` : ""}
                      {row.fileSize ? `${(row.fileSize / 1024 / 1024).toFixed(1)} MB` : "Uploaded"}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-gray-400">No PDF uploaded</p>
                  )}
                  {busy ? (
                    <p className="mt-2 inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {progress || "Working…"}
                    </p>
                  ) : null}
                </div>
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
                    disabled={busy}
                    onClick={() => inputRefs.current[code]?.click()}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
                  >
                    <Upload className="h-4 w-4" />
                    {row ? "Replace" : "Upload PDF"}
                  </button>
                  {row ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete(code)}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
              {row ? (
                <a
                  href={row.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  Preview PDF file →
                </a>
              ) : null}
            </article>
          );
        })}
      </div>
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
