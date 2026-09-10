"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { SectionBlocksEditor } from "@/components/admin/website/section-blocks-editor";
import { InlinePlusUpload, uploadWebsiteSlotFile } from "@/components/admin/website/inline-plus-upload";
import { uploadFileDirectToStorage } from "@/lib/website/direct-upload";
import {
  ADDABLE_SECTION_TYPES,
  BLOCK_CAPABLE_SECTION_TYPES,
  BUILTIN_SECTION_TYPES,
  CONTENT_LAYOUTS,
  SECTION_LABELS,
  createPageSection,
  normalizePageLayout,
  normalizePromoSlideshows,
} from "@/lib/website/page-layout";
import type {
  WebsiteContent,
  WebsiteContentLayout,
  WebsiteMediaSlot,
  WebsitePageSection,
  WebsitePromoSlide,
  WebsitePromoSlideshow,
  WebsiteSectionType,
  WebsiteSettings,
} from "@/lib/website/types";
import { saveWebsiteSettings, updateWebsiteMediaObjectPosition } from "@/src/lib/website-actions";

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none ring-[#C9A88B] focus:ring-2 dark:border-gray-700 dark:bg-gray-950";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}

function newSlideId() {
  return `slide-${Math.random().toString(36).slice(2, 10)}`;
}

export function WebsiteSectionBuilder({ initial }: { initial: WebsiteContent }) {
  const router = useRouter();
  const [settings, setSettings] = useState<WebsiteSettings>(() => ({
    ...initial.settings,
    pageLayout: normalizePageLayout(initial.settings.pageLayout),
    promoSlideshows: normalizePromoSlideshows(initial.settings.promoSlideshows),
  }));
  const [media, setMedia] = useState(initial.media);
  const [selectedId, setSelectedId] = useState<string>(
    () => normalizePageLayout(initial.settings.pageLayout)[0]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const layout = settings.pageLayout;
  const selected = useMemo(
    () => layout.find((section) => section.id === selectedId) ?? layout[0],
    [layout, selectedId],
  );

  const markDirty = () => {
    dirtyRef.current = true;
  };

  const updateLayout = (next: WebsitePageSection[]) => {
    markDirty();
    setSettings((prev) => ({
      ...prev,
      pageLayout: next.map((section, index) => ({ ...section, sortOrder: index })),
    }));
  };

  const patchSection = (id: string, patch: Partial<WebsitePageSection>) => {
    updateLayout(
      layout.map((section) => (section.id === id ? { ...section, ...patch } : section)),
    );
  };

  const patchSectionProps = (
    id: string,
    propsPatch: NonNullable<WebsitePageSection["props"]>,
  ) => {
    const section = layout.find((row) => row.id === id);
    if (!section) return;
    patchSection(id, {
      props: { ...section.props, ...propsPatch },
    });
  };

  const updateSettingsFields = (patch: Partial<WebsiteSettings>) => {
    markDirty();
    setSettings((prev) => ({ ...prev, ...patch }));
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
    setMessage("Sections saved. Landing page will refresh shortly.");
    router.refresh();
  };

  const moveSection = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= layout.length) return;
    const next = [...layout];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    updateLayout(next);
  };

  const addSection = (type: WebsiteSectionType) => {
    const section = createPageSection(type);
    updateLayout([...layout, section]);
    setSelectedId(section.id);
  };

  const removeSection = (section: WebsitePageSection) => {
    if (BUILTIN_SECTION_TYPES.includes(section.type) && section.type !== "promo_slideshow") {
      setError("Built-in sections can be disabled, but not deleted.");
      return;
    }
    const next = layout.filter((row) => row.id !== section.id);
    updateLayout(next);
    if (selectedId === section.id) setSelectedId(next[0]?.id ?? "");
  };

  const uploadSlot = async (slot: WebsiteMediaSlot, file: File) => {
    setBusy(true);
    setError(null);
    const result = await uploadWebsiteSlotFile(slot, file);
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error || "Upload failed");
      return;
    }
    setMedia((prev) => ({ ...prev, [slot]: result.data }));
    setMessage(`Updated ${slot.replaceAll("_", " ")}.`);
  };

  const slideshow =
    settings.promoSlideshows.find(
      (row) => row.id === (selected?.props?.slideshowId || "promo-main"),
    ) ?? settings.promoSlideshows[0];

  const updateSlideshow = (next: WebsitePromoSlideshow) => {
    markDirty();
    setSettings((prev) => ({
      ...prev,
      promoSlideshows: prev.promoSlideshows.map((row) => (row.id === next.id ? next : row)),
    }));
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Landing sections
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Edit each homepage section directly — text, images, layout, order, and components.
            No visual designer; changes save to the live landing page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/"
            target="_blank"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"
          >
            Preview live ↗
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveAll()}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
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

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Page sections
            </p>
            <ul className="space-y-1">
              {layout.map((section, index) => {
                const active = section.id === selected?.id;
                return (
                  <li key={section.id}>
                    <div
                      className={`flex items-center gap-1 rounded-xl px-1 py-1 ${
                        active ? "bg-gray-100 dark:bg-gray-800" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(section.id)}
                        className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-sm"
                      >
                        <span className="block truncate font-medium">
                          {SECTION_LABELS[section.type]}
                        </span>
                        <span className="text-[11px] text-gray-500">
                          {section.enabled ? "Enabled" : "Disabled"}
                          {section.props?.blocks?.length
                            ? ` · ${section.props.blocks.length} components`
                            : ""}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-gray-500 hover:bg-white dark:hover:bg-gray-900"
                        onClick={() => patchSection(section.id, { enabled: !section.enabled })}
                        title={section.enabled ? "Disable" : "Enable"}
                      >
                        {section.enabled ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-gray-500 disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() => moveSection(index, -1)}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-gray-500 disabled:opacity-30"
                        disabled={index === layout.length - 1}
                        onClick={() => moveSection(index, 1)}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Add section
            </p>
            <div className="space-y-1">
              {ADDABLE_SECTION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addSection(type)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <Plus className="h-3.5 w-3.5 text-[#C9A88B]" />
                  {SECTION_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="space-y-5">
          {!selected ? (
            <p className="text-sm text-gray-500">Select a section to edit.</p>
          ) : (
            <>
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{SECTION_LABELS[selected.type]}</h2>
                    <p className="mt-1 text-xs text-gray-500">ID: {selected.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        patchSection(selected.id, { enabled: !selected.enabled })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs dark:border-gray-700"
                    >
                      {selected.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {selected.enabled ? "Enabled" : "Disabled"}
                    </button>
                    {!BUILTIN_SECTION_TYPES.includes(selected.type) ||
                    selected.type === "promo_slideshow" ? (
                      <button
                        type="button"
                        onClick={() => removeSection(selected)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 dark:border-red-900"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove section
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Field label="Desktop padding">
                    <select
                      className={inputClass}
                      value={selected.desktop?.padding ?? "normal"}
                      onChange={(e) =>
                        patchSection(selected.id, {
                          desktop: {
                            ...selected.desktop,
                            padding: e.target.value as "compact" | "normal" | "spacious",
                          },
                        })
                      }
                    >
                      <option value="compact">Compact</option>
                      <option value="normal">Normal</option>
                      <option value="spacious">Spacious</option>
                    </select>
                  </Field>
                  <Field label="Mobile padding">
                    <select
                      className={inputClass}
                      value={selected.mobile?.padding ?? "normal"}
                      onChange={(e) =>
                        patchSection(selected.id, {
                          mobile: {
                            ...selected.mobile,
                            padding: e.target.value as "compact" | "normal" | "spacious",
                          },
                        })
                      }
                    >
                      <option value="compact">Compact</option>
                      <option value="normal">Normal</option>
                      <option value="spacious">Spacious</option>
                    </select>
                  </Field>
                </div>
              </div>

              {selected.type === "hero" ? (
                <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                  <h3 className="text-sm font-semibold">Hero content</h3>
                  <Field label="Headline">
                    <input
                      className={inputClass}
                      value={settings.heroHeadline}
                      onChange={(e) => updateSettingsFields({ heroHeadline: e.target.value })}
                    />
                  </Field>
                  <Field label="Tagline">
                    <input
                      className={inputClass}
                      value={settings.heroTagline}
                      onChange={(e) => updateSettingsFields({ heroTagline: e.target.value })}
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      className={`${inputClass} min-h-[88px]`}
                      value={settings.heroDescription}
                      onChange={(e) => updateSettingsFields({ heroDescription: e.target.value })}
                    />
                  </Field>
                  <SlotImageEditor
                    label="Hero image"
                    slot="hero_image"
                    media={media.hero_image}
                    onUpload={(file) => void uploadSlot("hero_image", file)}
                    onPosition={async (objectPosition) => {
                      const { data, error: posError } = await updateWebsiteMediaObjectPosition(
                        "hero_image",
                        objectPosition,
                      );
                      if (posError) setError(posError.message);
                      if (data) setMedia((prev) => ({ ...prev, hero_image: data }));
                    }}
                  />
                  <p className="text-xs text-gray-500">
                    Hero also fades in images from the Event slideshow when slides are present.
                  </p>
                </div>
              ) : null}

              {selected.type === "about" ? (
                <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                  <h3 className="text-sm font-semibold">About defaults (used when no components)</h3>
                  <Field label="Tagline">
                    <input
                      className={inputClass}
                      value={settings.tagline}
                      onChange={(e) => updateSettingsFields({ tagline: e.target.value })}
                    />
                  </Field>
                  <Field label="About story">
                    <textarea
                      className={`${inputClass} min-h-[88px]`}
                      value={settings.aboutStory}
                      onChange={(e) => updateSettingsFields({ aboutStory: e.target.value })}
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      className={`${inputClass} min-h-[72px]`}
                      value={settings.description}
                      onChange={(e) => updateSettingsFields({ description: e.target.value })}
                    />
                  </Field>
                  <SlotImageEditor
                    label="About image (legacy layout)"
                    slot="about_image"
                    media={media.about_image}
                    onUpload={(file) => void uploadSlot("about_image", file)}
                    onPosition={async (objectPosition) => {
                      const { data, error: posError } = await updateWebsiteMediaObjectPosition(
                        "about_image",
                        objectPosition,
                      );
                      if (posError) setError(posError.message);
                      if (data) setMedia((prev) => ({ ...prev, about_image: data }));
                    }}
                  />
                </div>
              ) : null}

              {(selected.type === "signature" ||
                selected.type === "experience" ||
                selected.type === "content" ||
                selected.type === "custom_text" ||
                selected.type === "custom_cta" ||
                selected.type === "promo_slideshow") && (
                <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                  <h3 className="text-sm font-semibold">Section text</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Eyebrow">
                      <input
                        className={inputClass}
                        value={selected.props?.eyebrow ?? ""}
                        onChange={(e) =>
                          patchSectionProps(selected.id, { eyebrow: e.target.value })
                        }
                      />
                    </Field>
                    {selected.type === "custom_cta" || selected.type === "custom_text" ? (
                      <Field label="Background">
                        <select
                          className={inputClass}
                          value={selected.props?.background ?? "charcoal"}
                          onChange={(e) =>
                            patchSectionProps(selected.id, {
                              background: e.target.value as "dark" | "charcoal" | "warm",
                            })
                          }
                        >
                          <option value="dark">Dark</option>
                          <option value="charcoal">Charcoal</option>
                          <option value="warm">Warm</option>
                        </select>
                      </Field>
                    ) : (
                      <div />
                    )}
                  </div>
                  <Field label="Headline">
                    <input
                      className={inputClass}
                      value={selected.props?.headline ?? ""}
                      onChange={(e) =>
                        patchSectionProps(selected.id, { headline: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Body">
                    <textarea
                      className={`${inputClass} min-h-[88px]`}
                      value={selected.props?.body ?? ""}
                      onChange={(e) => patchSectionProps(selected.id, { body: e.target.value })}
                    />
                  </Field>
                  {selected.type === "custom_cta" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="CTA label">
                        <input
                          className={inputClass}
                          value={selected.props?.ctaLabel ?? ""}
                          onChange={(e) =>
                            patchSectionProps(selected.id, { ctaLabel: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="CTA link">
                        <input
                          className={inputClass}
                          value={selected.props?.ctaHref ?? ""}
                          onChange={(e) =>
                            patchSectionProps(selected.id, { ctaHref: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                  ) : null}
                  {BLOCK_CAPABLE_SECTION_TYPES.includes(selected.type) ? (
                    <Field label="Default layout for new components">
                      <select
                        className={inputClass}
                        value={selected.props?.defaultLayout ?? "image_left_text_right"}
                        onChange={(e) =>
                          patchSectionProps(selected.id, {
                            defaultLayout: e.target.value as WebsiteContentLayout,
                          })
                        }
                      >
                        {CONTENT_LAYOUTS.map((layoutOption) => (
                          <option key={layoutOption.id} value={layoutOption.id}>
                            {layoutOption.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                </div>
              )}

              {selected.type === "signature" ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  Without components, Signature shows featured menu items. Manage featured dishes in{" "}
                  <Link href="/admin/menu" className="underline">
                    Menu
                  </Link>
                  , or add components below for full layout control.
                </div>
              ) : null}

              {selected.type === "promo_slideshow" && slideshow ? (
                <PromoSlidesEditor
                  slideshow={slideshow}
                  onChange={updateSlideshow}
                  onError={setError}
                />
              ) : null}

              {(selected.type === "menu" ||
                selected.type === "gallery" ||
                selected.type === "amenities" ||
                selected.type === "contact") && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                  This section pulls content from its dedicated CMS page. You can enable/disable and
                  reorder it here.
                  <div className="mt-3 flex flex-wrap gap-3">
                    {selected.type === "menu" ? (
                      <Link href="/admin/menu" className="text-blue-600 underline">
                        Edit menu →
                      </Link>
                    ) : null}
                    {selected.type === "gallery" ? (
                      <Link href="/admin/gallery" className="text-blue-600 underline">
                        Edit gallery →
                      </Link>
                    ) : null}
                    {selected.type === "amenities" ? (
                      <Link href="/admin/amenities" className="text-blue-600 underline">
                        Edit amenities →
                      </Link>
                    ) : null}
                    {selected.type === "contact" ? (
                      <Link href="/admin/restaurant" className="text-blue-600 underline">
                        Edit restaurant details →
                      </Link>
                    ) : null}
                  </div>
                </div>
              )}

              {BLOCK_CAPABLE_SECTION_TYPES.includes(selected.type) ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                  <SectionBlocksEditor
                    blocks={selected.props?.blocks ?? []}
                    defaultLayout={
                      selected.props?.defaultLayout ??
                      (selected.type === "signature"
                        ? "featured_support"
                        : "image_left_text_right")
                    }
                    onChange={(blocks) => patchSectionProps(selected.id, { blocks })}
                  />
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function SlotImageEditor({
  label,
  slot,
  media,
  onUpload,
  onPosition,
}: {
  label: string;
  slot: WebsiteMediaSlot;
  media?: WebsiteContent["media"][WebsiteMediaSlot];
  onUpload: (file: File) => void;
  onPosition: (objectPosition: string) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</p>
      <div className="flex flex-wrap items-start gap-4">
        <div className="relative h-28 w-40 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
          {media?.fileUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.fileUrl}
              alt={media.altText || slot}
              className="h-full w-full object-cover"
              style={{ objectPosition: media.objectPosition ?? "50% 50%" }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-gray-400">
              No image
            </div>
          )}
        </div>
        <div className="space-y-2">
          <InlinePlusUpload
            accept="image/*"
            label={media?.fileUrl ? "Replace image" : "Upload image"}
            hasMedia={Boolean(media?.fileUrl)}
            onFile={async (file) => onUpload(file)}
          />
          {media?.fileUrl ? (
            <Field label="Focal point (object-position)">
              <input
                className={inputClass}
                defaultValue={media.objectPosition ?? "50% 50%"}
                onBlur={(e) => void onPosition(e.target.value || "50% 50%")}
                placeholder="50% 40%"
              />
            </Field>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PromoSlidesEditor({
  slideshow,
  onChange,
  onError,
}: {
  slideshow: WebsitePromoSlideshow;
  onChange: (next: WebsitePromoSlideshow) => void;
  onError: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const updateSlides = (slides: WebsitePromoSlide[]) => {
    onChange({
      ...slideshow,
      slides: slides.map((slide, index) => ({ ...slide, sortOrder: index })),
    });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Event / promo slides</h3>
          <p className="text-xs text-gray-500">
            Images feed the hero fade and this section when enabled.
          </p>
        </div>
        <button
          type="button"
          disabled={uploading}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = () => {
              const file = input.files?.[0];
              if (!file) return;
              void (async () => {
                setUploading(true);
                const uploaded = await uploadFileDirectToStorage(file, "misc");
                setUploading(false);
                if (!uploaded.publicUrl) {
                  onError(uploaded.error || "Upload failed");
                  return;
                }
                updateSlides([
                  ...slideshow.slides,
                  {
                    id: newSlideId(),
                    title: "New slide",
                    subtitle: "",
                    imageUrl: uploaded.publicUrl,
                    enabled: true,
                    sortOrder: slideshow.slides.length,
                  },
                ]);
              })();
            };
            input.click();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9A88B] px-3 py-2 text-xs font-semibold text-[#1a1210]"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          Add slide
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Slideshow name">
          <input
            className={inputClass}
            value={slideshow.name}
            onChange={(e) => onChange({ ...slideshow, name: e.target.value })}
          />
        </Field>
        <Field label="Autoplay (ms)">
          <input
            type="number"
            min={2000}
            className={inputClass}
            value={slideshow.autoplayMs}
            onChange={(e) =>
              onChange({ ...slideshow, autoplayMs: Number(e.target.value) || 5200 })
            }
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={slideshow.enabled}
          onChange={(e) => onChange({ ...slideshow, enabled: e.target.checked })}
        />
        Slideshow data enabled (also powers hero images)
      </label>

      <div className="space-y-3">
        {slideshow.slides.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700">
            No slides yet. Upload poster images for events or promotions.
          </p>
        ) : (
          slideshow.slides.map((slide, index) => (
            <div
              key={slide.id}
              className="rounded-xl border border-gray-200 p-3 dark:border-gray-700"
            >
              <div className="flex gap-3">
                <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                  {slide.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slide.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      className="rounded border px-2 py-1 text-xs disabled:opacity-30"
                      onClick={() => {
                        if (index === 0) return;
                        const slides = [...slideshow.slides];
                        const [moved] = slides.splice(index, 1);
                        slides.splice(index - 1, 0, moved);
                        updateSlides(slides);
                      }}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      disabled={index === slideshow.slides.length - 1}
                      className="rounded border px-2 py-1 text-xs disabled:opacity-30"
                      onClick={() => {
                        if (index >= slideshow.slides.length - 1) return;
                        const slides = [...slideshow.slides];
                        const [moved] = slides.splice(index, 1);
                        slides.splice(index + 1, 0, moved);
                        updateSlides(slides);
                      }}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs"
                      onClick={() =>
                        updateSlides(
                          slideshow.slides.map((row) =>
                            row.id === slide.id ? { ...row, enabled: !row.enabled } : row,
                          ),
                        )
                      }
                    >
                      {slide.enabled ? "On" : "Off"}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600"
                      onClick={() =>
                        updateSlides(slideshow.slides.filter((row) => row.id !== slide.id))
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    className={inputClass}
                    value={slide.title}
                    onChange={(e) =>
                      updateSlides(
                        slideshow.slides.map((row) =>
                          row.id === slide.id ? { ...row, title: e.target.value } : row,
                        ),
                      )
                    }
                    placeholder="Title"
                  />
                  <input
                    className={inputClass}
                    value={slide.subtitle}
                    onChange={(e) =>
                      updateSlides(
                        slideshow.slides.map((row) =>
                          row.id === slide.id ? { ...row, subtitle: e.target.value } : row,
                        ),
                      )
                    }
                    placeholder="Subtitle"
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
