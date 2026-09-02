"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, FileText } from "lucide-react";
import { MENU_PDF_LANGUAGES } from "@/lib/website/defaults";
import type { MenuPdfLanguage, WebsiteMenuPdf } from "@/lib/website/types";
import { deleteWebsiteMenuPdf, uploadWebsiteMenuPdf } from "@/src/lib/website-actions";

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function countPdfPages(file: File): Promise<number> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  return doc.numPages;
}

interface MenuPdfManagerProps {
  initial: WebsiteMenuPdf[];
}

export function MenuPdfManager({ initial }: MenuPdfManagerProps) {
  const router = useRouter();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [rows, setRows] = useState(initial);
  const [busyLang, setBusyLang] = useState<MenuPdfLanguage | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const getRow = (language: MenuPdfLanguage) => rows.find((row) => row.language === language);

  const handleUpload = async (language: MenuPdfLanguage, file: File) => {
    setBusyLang(language);
    setMessage(null);
    try {
      let pageCount: number | undefined;
      try {
        pageCount = await countPdfPages(file);
      } catch {
        pageCount = undefined;
      }
      const base64 = await fileToBase64(file);
      const { data, error } = await uploadWebsiteMenuPdf({
        language,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        pageCount,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      if (data) {
        setRows((prev) => {
          const next = prev.filter((row) => row.language !== language);
          return [...next, data];
        });
        setMessage(`${MENU_PDF_LANGUAGES.find((r) => r.code === language)?.label} menu saved.`);
        router.refresh();
      }
    } finally {
      setBusyLang(null);
    }
  };

  const handleDelete = async (language: MenuPdfLanguage) => {
    setBusyLang(language);
    const { error } = await deleteWebsiteMenuPdf(language);
    setBusyLang(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    setRows((prev) => prev.filter((row) => row.language !== language));
    setMessage("PDF removed.");
    router.refresh();
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
                </div>
                <div className="flex gap-2">
                  <input
                    ref={(el) => {
                      inputRefs.current[code] = el;
                    }}
                    type="file"
                    accept="application/pdf"
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
      {message ? <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">{message}</p> : null}
    </section>
  );
}
