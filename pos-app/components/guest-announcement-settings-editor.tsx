"use client";

import { useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import {
  fromDatetimeLocalValue,
  resolveGuestAnnouncementCopy,
  toDatetimeLocalValue,
  type GuestAnnouncementBanner,
} from "@/lib/guest-announcement";
import {
  GUEST_RESERVATION_LANGS,
  type GuestReservationLang,
  type LocalizedGuestText,
} from "@/lib/reservation-guest-form";
import type { TranslationKey } from "@/lib/i18n/translations";
import { filterButtonClass } from "@/lib/theme-classes";
import { GuestAnnouncementBar } from "@/components/landing/guest-announcement-banner";

const GUEST_LANG_LABELS: Record<GuestReservationLang, string> = {
  en: "English",
  cs: "Čeština",
  vi: "Tiếng Việt",
  de: "Deutsch",
  ko: "한국어",
};

type Props = {
  value: GuestAnnouncementBanner;
  onChange: (next: GuestAnnouncementBanner) => void;
  translate: (key: TranslationKey) => string;
};

function updateLocalized(
  current: LocalizedGuestText,
  lang: GuestReservationLang,
  text: string,
): LocalizedGuestText {
  return { ...current, [lang]: text };
}

export function GuestAnnouncementSettingsEditor({ value, onChange, translate }: Props) {
  const [editLang, setEditLang] = useState<GuestReservationLang>("en");
  const [previewLang, setPreviewLang] = useState<GuestReservationLang>("en");

  const previewCopy = useMemo(
    () => resolveGuestAnnouncementCopy(value, previewLang),
    [value, previewLang],
  );

  const patch = (partial: Partial<GuestAnnouncementBanner>) => {
    onChange({ ...value, ...partial });
  };

  return (
    <div className="space-y-5">
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
        <span className="text-sm text-gray-800 dark:text-gray-200">
          {translate("settingsAnnouncementEnabled")}
        </span>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) => patch({ enabled: event.target.checked })}
          className="h-4 w-4 rounded border-gray-300"
        />
      </label>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {translate("settingsAnnouncementSurfaces")}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {translate("settingsAnnouncementSurfacesHint")}
        </p>
        <div className="mt-2 flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input
              type="checkbox"
              checked={value.showOnLanding}
              onChange={(event) => patch({ showOnLanding: event.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            {translate("settingsAnnouncementOnLanding")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input
              type="checkbox"
              checked={value.showOnReservation}
              onChange={(event) => patch({ showOnReservation: event.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            {translate("settingsAnnouncementOnReservation")}
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            {translate("settingsAnnouncementStartAt")}
          </span>
          <input
            type="datetime-local"
            value={toDatetimeLocalValue(value.startAt)}
            onChange={(event) => patch({ startAt: fromDatetimeLocalValue(event.target.value) })}
            className="pos-input mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            {translate("settingsAnnouncementEndAt")}
          </span>
          <input
            type="datetime-local"
            value={toDatetimeLocalValue(value.endAt)}
            onChange={(event) => patch({ endAt: fromDatetimeLocalValue(event.target.value) })}
            className="pos-input mt-1"
          />
        </label>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {translate("settingsAnnouncementScheduleHint")}
      </p>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {translate("settingsAnnouncementContent")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {GUEST_RESERVATION_LANGS.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setEditLang(lang)}
              className={filterButtonClass(editLang === lang)}
            >
              {GUEST_LANG_LABELS[lang]}
            </button>
          ))}
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            {translate("settingsAnnouncementTitle")} ({GUEST_LANG_LABELS[editLang]})
          </span>
          <input
            type="text"
            value={value.title[editLang]}
            onChange={(event) =>
              patch({ title: updateLocalized(value.title, editLang, event.target.value) })
            }
            className="pos-input mt-1"
            placeholder={translate("settingsAnnouncementTitlePlaceholder")}
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            {translate("settingsAnnouncementMessage")} ({GUEST_LANG_LABELS[editLang]})
          </span>
          <textarea
            rows={3}
            value={value.message[editLang]}
            onChange={(event) =>
              patch({ message: updateLocalized(value.message, editLang, event.target.value) })
            }
            className="pos-input mt-1"
            placeholder={translate("settingsAnnouncementMessagePlaceholder")}
          />
        </label>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {translate("settingsAnnouncementPreview")}
          </p>
          <div className="flex flex-wrap gap-1">
            {GUEST_RESERVATION_LANGS.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setPreviewLang(lang)}
                className={filterButtonClass(previewLang === lang)}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-[#0B0B0C] dark:border-gray-700">
          {previewCopy.title || previewCopy.message ? (
            <GuestAnnouncementBar
              title={previewCopy.title}
              message={previewCopy.message}
              preview
            />
          ) : (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-white/50">
              <Megaphone className="h-4 w-4 shrink-0" />
              {translate("settingsAnnouncementPreviewEmpty")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
