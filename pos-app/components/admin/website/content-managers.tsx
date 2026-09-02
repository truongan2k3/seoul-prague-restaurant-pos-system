"use client";

import { useState } from "react";
import type { WebsiteAmenity, WebsiteContent } from "@/lib/website/types";
import {
  deleteWebsiteAmenity,
  upsertWebsiteAmenity,
} from "@/src/lib/website-actions";

export function AmenitiesManager({ initial }: { initial: WebsiteAmenity[] }) {
  const [rows, setRows] = useState(initial);
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const add = async () => {
    if (!label.trim()) return;
    const { data, error } = await upsertWebsiteAmenity({
      label: label.trim(),
      icon: "sparkles",
      sortOrder: rows.length,
      enabled: true,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data) setRows((prev) => [...prev, data]);
    setLabel("");
    setMessage("Added.");
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-semibold">Amenities</h2>
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
            <span>{row.label}</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs text-gray-500"
                onClick={async () => {
                  const { data } = await upsertWebsiteAmenity({ ...row, enabled: !row.enabled });
                  if (data) setRows((prev) => prev.map((item) => (item.id === row.id ? data : item)));
                }}
              >
                {row.enabled ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                className="text-xs text-red-600"
                onClick={async () => {
                  await deleteWebsiteAmenity(row.id);
                  setRows((prev) => prev.filter((item) => item.id !== row.id));
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} className="pos-input flex-1" placeholder="New amenity" />
        <button type="button" onClick={() => void add()} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white dark:bg-gray-100 dark:text-gray-900">
          Add
        </button>
      </div>
      {message ? <p className="mt-2 text-sm">{message}</p> : null}
    </section>
  );
}

export function MenuManager({ content }: { content: WebsiteContent }) {
  const [categories, setCategories] = useState(content.menuCategories);
  const [items, setItems] = useState(content.menuItems);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-lg font-semibold">Menu categories</h2>
        <ul className="mt-4 space-y-2">
          {categories.map((cat) => (
            <li key={cat.id} className="grid gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800 sm:grid-cols-3">
              <input
                value={cat.name}
                onChange={(e) =>
                  setCategories((prev) =>
                    prev.map((row) => (row.id === cat.id ? { ...row, name: e.target.value } : row)),
                  )
                }
                className="pos-input"
              />
              <input
                value={cat.slug}
                onChange={(e) =>
                  setCategories((prev) =>
                    prev.map((row) => (row.id === cat.id ? { ...row, slug: e.target.value } : row)),
                  )
                }
                className="pos-input"
              />
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={async () => {
                  const { upsertWebsiteMenuCategory } = await import("@/src/lib/website-actions");
                  const { data, error } = await upsertWebsiteMenuCategory(cat);
                  setMessage(error ? error.message : "Category saved.");
                  if (data) setCategories((prev) => prev.map((row) => (row.id === cat.id ? data : row)));
                }}
              >
                Save
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-lg font-semibold">Menu items</h2>
        <ul className="mt-4 space-y-4">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="grid gap-3 lg:grid-cols-2">
                <input
                  value={item.name}
                  onChange={(e) =>
                    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, name: e.target.value } : row)))
                  }
                  className="pos-input"
                />
                <select
                  value={item.categoryId}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row) => (row.id === item.id ? { ...row, categoryId: e.target.value } : row)),
                    )
                  }
                  className="pos-input"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <textarea
                  value={item.description}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row) => (row.id === item.id ? { ...row, description: e.target.value } : row)),
                    )
                  }
                  className="pos-input min-h-[72px] lg:col-span-2"
                />
                <input
                  type="number"
                  placeholder="Price"
                  value={item.price ?? ""}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row) =>
                        row.id === item.id
                          ? { ...row, price: e.target.value ? Number(e.target.value) : null }
                          : row,
                      ),
                    )
                  }
                  className="pos-input"
                />
                <input
                  value={item.badge}
                  placeholder="Badge"
                  onChange={(e) =>
                    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, badge: e.target.value } : row)))
                  }
                  className="pos-input"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.featured}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row) => (row.id === item.id ? { ...row, featured: e.target.checked } : row)),
                      )
                    }
                  />
                  Featured
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.available}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row) => (row.id === item.id ? { ...row, available: e.target.checked } : row)),
                      )
                    }
                  />
                  Available
                </label>
                <button
                  type="button"
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white"
                  onClick={async () => {
                    const { upsertWebsiteMenuItem } = await import("@/src/lib/website-actions");
                    const row = items.find((entry) => entry.id === item.id);
                    if (!row) return;
                    const { data, error } = await upsertWebsiteMenuItem(row);
                    setMessage(error ? error.message : "Item saved.");
                    if (data) setItems((prev) => prev.map((entry) => (entry.id === item.id ? data : entry)));
                  }}
                >
                  Save item
                </button>
              </div>
            </li>
          ))}
        </ul>
        {message ? <p className="mt-4 text-sm">{message}</p> : null}
      </section>
    </div>
  );
}

export function GalleryManager({ initial }: { initial: WebsiteContent["gallery"] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setBusy(true);
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    const { uploadWebsiteGalleryImage } = await import("@/src/lib/website-actions");
    const { data, error } = await uploadWebsiteGalleryImage({
      category: "food",
      title: file.name,
      fileBase64: btoa(binary),
      fileName: file.name,
      mimeType: file.type,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data) setRows((prev) => [...prev, data]);
    setMessage("Uploaded.");
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-semibold">Gallery</h2>
      <input
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
        }}
        className="mt-4 block w-full text-sm"
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <figure key={row.id} className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={row.imageUrl} alt={row.title} className="aspect-[4/3] w-full object-cover" />
            <figcaption className="flex items-center justify-between p-2 text-xs">
              <span>{row.category}</span>
              <button
                type="button"
                className="text-red-600"
                onClick={async () => {
                  const { deleteWebsiteGalleryItem } = await import("@/src/lib/website-actions");
                  await deleteWebsiteGalleryItem(row.id);
                  setRows((prev) => prev.filter((item) => item.id !== row.id));
                }}
              >
                Delete
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </section>
  );
}

export function VideosManager({ initial }: { initial: WebsiteContent["videos"] }) {
  const [rows, setRows] = useState(initial);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-semibold">Videos</h2>
      <div className="mt-4 space-y-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="pos-input" placeholder="Video title" />
        <input
          type="file"
          accept="video/mp4,video/webm"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const buffer = await file.arrayBuffer();
            let binary = "";
            const bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
            const { uploadWebsiteVideoFile } = await import("@/src/lib/website-actions");
            const { data, error } = await uploadWebsiteVideoFile({
              title: title || file.name,
              slot: "promo",
              fileBase64: btoa(binary),
              fileName: file.name,
              mimeType: file.type,
            });
            setMessage(error ? error.message : "Video uploaded.");
            if (data) setRows((prev) => [...prev, data]);
          }}
          className="block w-full text-sm"
        />
      </div>
      <ul className="mt-6 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <p className="font-medium">{row.title || "Untitled"}</p>
            <video src={row.videoUrl} controls className="mt-2 max-h-40 w-full" />
          </li>
        ))}
      </ul>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </section>
  );
}
