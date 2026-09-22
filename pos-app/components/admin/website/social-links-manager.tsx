"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SOCIAL_PLATFORM_OPTIONS } from "@/lib/website/social-links";
import type { WebsiteSocialLink } from "@/lib/website/types";
import { saveWebsiteSettings } from "@/src/lib/website-actions";

interface SocialLinksManagerProps {
  initial: WebsiteSocialLink[];
}

function newId() {
  return `social-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function SocialLinksManager({ initial }: SocialLinksManagerProps) {
  const [links, setLinks] = useState<WebsiteSocialLink[]>(
    initial.length > 0
      ? [...initial].sort((a, b) => a.sortOrder - b.sortOrder)
      : [],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const updateLink = (id: string, patch: Partial<WebsiteSocialLink>) => {
    setLinks((prev) => prev.map((link) => (link.id === id ? { ...link, ...patch } : link)));
  };

  const addLink = () => {
    setLinks((prev) => [
      ...prev,
      {
        id: newId(),
        platform: "instagram",
        url: "",
        sortOrder: prev.length,
      },
    ]);
  };

  const removeLink = (id: string) => {
    setLinks((prev) =>
      prev.filter((link) => link.id !== id).map((link, index) => ({ ...link, sortOrder: index })),
    );
  };

  const handleSave = async () => {
    setBusy(true);
    setMessage(null);
    const cleaned = links
      .map((link, index) => ({
        ...link,
        platform: link.platform.trim().toLowerCase() || "other",
        url: link.url.trim(),
        sortOrder: index,
      }))
      .filter((link) => link.url.length > 0);

    const { error } = await saveWebsiteSettings({ socialLinks: cleaned });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setLinks(cleaned);
    setMessage("Social links saved.");
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-semibold">Social media</h2>
      <p className="mt-1 text-sm text-gray-500">
        Add platforms and URLs shown under Visit Us and in the footer. Leave empty rows blank — they
        are removed on save.
      </p>

      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li
            key={link.id}
            className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
          >
            <label className="block text-sm">
              <span className="text-gray-500">Platform</span>
              <select
                value={link.platform}
                onChange={(event) => updateLink(link.id, { platform: event.target.value })}
                className="pos-input mt-1"
              >
                {SOCIAL_PLATFORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[16rem] flex-1 block text-sm">
              <span className="text-gray-500">URL</span>
              <input
                value={link.url}
                onChange={(event) => updateLink(link.id, { url: event.target.value })}
                placeholder="https://"
                className="pos-input mt-1"
              />
            </label>
            <button
              type="button"
              onClick={() => removeLink(link.id)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={addLink}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium dark:border-gray-700"
        >
          <Plus className="h-4 w-4" />
          Add platform
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSave()}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save social links"}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{message}</p> : null}
    </section>
  );
}
