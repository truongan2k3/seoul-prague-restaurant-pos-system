"use client";

import { useState } from "react";
import type { WebsiteContent, WebsiteSettings } from "@/lib/website/types";
import { saveWebsiteSettings } from "@/src/lib/website-actions";

interface SettingsFormProps {
  initial: WebsiteSettings;
  fields: Array<keyof WebsiteSettings>;
  title: string;
  onSaved?: () => void;
}

export function WebsiteSettingsForm({ initial, fields, title, onSaved }: SettingsFormProps) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const labels: Partial<Record<keyof WebsiteSettings, string>> = {
    restaurantName: "Restaurant name",
    tagline: "Tagline",
    description: "Short description",
    aboutStory: "About story",
    phone: "Phone",
    email: "Email",
    address: "Address",
    googleMapsUrl: "Google Maps URL",
    heroHeadline: "Hero headline",
    heroTagline: "Hero tagline",
    heroDescription: "Hero description",
    instagramUrl: "Instagram URL",
    facebookUrl: "Facebook URL",
    tiktokUrl: "TikTok URL",
    seoTitle: "SEO title",
    seoDescription: "SEO description",
    seoOgImageUrl: "Open Graph image URL",
  };

  const handleSave = async () => {
    setBusy(true);
    setMessage(null);
    const patch: Partial<WebsiteSettings> = {};
    for (const key of fields) {
      if (
        key !== "openingHours" &&
        key !== "updatedAt" &&
        key !== "socialLinks" &&
        key !== "pageLayout" &&
        key !== "promoSlideshows"
      ) {
        patch[key] = form[key] as never;
      }
    }
    const { error } = await saveWebsiteSettings(patch);
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Saved.");
    onSaved?.();
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 space-y-4">
        {fields.map((field) => {
          if (
            field === "openingHours" ||
            field === "updatedAt" ||
            field === "socialLinks" ||
            field === "pageLayout" ||
            field === "promoSlideshows"
          ) {
            return null;
          }
          const value = form[field];
          const multiline = field === "description" || field === "aboutStory" || field === "seoDescription";
          return (
            <label key={field} className="block text-sm">
              <span className="text-gray-500">{labels[field] ?? field}</span>
              {multiline ? (
                <textarea
                  value={String(value ?? "")}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                  className="pos-input mt-1 min-h-[96px]"
                />
              ) : (
                <input
                  value={String(value ?? "")}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                  className="pos-input mt-1"
                />
              )}
            </label>
          );
        })}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleSave()}
        className="mt-6 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        Save changes
      </button>
      {message ? <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{message}</p> : null}
    </section>
  );
}

export function WebsiteHoursEditor({
  initial,
  onSaved,
}: {
  initial: WebsiteContent["settings"]["openingHours"];
  onSaved?: () => void;
}) {
  const [hours, setHours] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-semibold">Opening hours</h2>
      <ul className="mt-4 space-y-3">
        {hours.map((row, index) => (
          <li key={row.day} className="grid gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800 sm:grid-cols-[120px_1fr_1fr_auto]">
            <span className="text-sm font-medium capitalize">{row.day}</span>
            <input
              type="time"
              value={row.open}
              disabled={row.closed}
              onChange={(e) => {
                const next = [...hours];
                next[index] = { ...row, open: e.target.value };
                setHours(next);
              }}
              className="pos-input"
            />
            <input
              type="time"
              value={row.close}
              disabled={row.closed}
              onChange={(e) => {
                const next = [...hours];
                next[index] = { ...row, close: e.target.value };
                setHours(next);
              }}
              className="pos-input"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={row.closed}
                onChange={(e) => {
                  const next = [...hours];
                  next[index] = { ...row, closed: e.target.checked };
                  setHours(next);
                }}
              />
              Closed
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const { error } = await saveWebsiteSettings({ openingHours: hours });
          setBusy(false);
          setMessage(error ? error.message : "Saved.");
          if (!error) onSaved?.();
        }}
        className="mt-6 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
      >
        Save hours
      </button>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </section>
  );
}
