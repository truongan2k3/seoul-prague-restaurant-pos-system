"use client";

import { Plus, Trash2 } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/translations";
import {
  GUEST_RESERVATION_LANGS,
  RESERVATION_FORM_FIELD_KEYS,
  type GuestReservationLang,
  type LocalizedGuestText,
  type ReservationEventTypeOption,
  type ReservationGuestTexts,
  type ReservationRequiredFields,
} from "@/lib/reservation-guest-form";

type Props = {
  requiredFields: ReservationRequiredFields;
  eventTypes: ReservationEventTypeOption[];
  guestTexts: ReservationGuestTexts;
  onRequiredFieldsChange: (next: ReservationRequiredFields) => void;
  onEventTypesChange: (next: ReservationEventTypeOption[]) => void;
  onGuestTextsChange: (next: ReservationGuestTexts) => void;
  translate: (key: TranslationKey) => string;
};

const GUEST_LANG_LABELS: Record<GuestReservationLang, string> = {
  en: "English",
  cs: "Čeština",
  vi: "Tiếng Việt",
  de: "Deutsch",
  ko: "한국어",
};

const FIELD_LABEL_KEYS: Record<
  (typeof RESERVATION_FORM_FIELD_KEYS)[number],
  TranslationKey
> = {
  name: "settingsResFieldName",
  email: "settingsResFieldEmail",
  phone: "settingsResFieldPhone",
  guestCount: "settingsResFieldGuests",
  date: "settingsResFieldDate",
  time: "settingsResFieldTime",
  notes: "settingsResFieldNotes",
  eventType: "settingsResFieldEventType",
};

function updateLocalizedText(
  current: LocalizedGuestText,
  lang: GuestReservationLang,
  value: string,
): LocalizedGuestText {
  return { ...current, [lang]: value };
}

export function ReservationGuestFormSettingsEditor({
  requiredFields,
  eventTypes,
  guestTexts,
  onRequiredFieldsChange,
  onEventTypesChange,
  onGuestTextsChange,
  translate,
}: Props) {
  const updateGuestText = (
    key: keyof ReservationGuestTexts,
    lang: GuestReservationLang,
    value: string,
  ) => {
    onGuestTextsChange({
      ...guestTexts,
      [key]: updateLocalizedText(guestTexts[key], lang, value),
    });
  };

  const updateEventTypeLabel = (
    index: number,
    lang: GuestReservationLang,
    value: string,
  ) => {
    const next = eventTypes.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return {
        ...row,
        labels: updateLocalizedText(row.labels, lang, value),
      };
    });
    onEventTypesChange(next);
  };

  const addEventType = () => {
    const id = `custom-${Date.now()}`;
    onEventTypesChange([
      ...eventTypes,
      {
        id,
        labels: {
          en: "New event type",
          cs: "Nový typ akce",
          vi: "Loại sự kiện mới",
          de: "Neuer Anlass",
          ko: "새 행사 유형",
        },
      },
    ]);
  };

  const removeEventType = (index: number) => {
    if (eventTypes.length <= 1) return;
    onEventTypesChange(eventTypes.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {translate("settingsResGuestRequiredFields")}
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {translate("settingsResGuestRequiredFieldsHint")}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {RESERVATION_FORM_FIELD_KEYS.map((fieldKey) => (
            <label
              key={fieldKey}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-700"
            >
              <input
                type="checkbox"
                checked={requiredFields[fieldKey]}
                onChange={(event) =>
                  onRequiredFieldsChange({
                    ...requiredFields,
                    [fieldKey]: event.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-gray-800 dark:text-gray-200">
                {translate(FIELD_LABEL_KEYS[fieldKey])}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {translate("settingsResEventTypes")}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {translate("settingsResEventTypesHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={addEventType}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
          >
            <Plus className="h-3.5 w-3.5" />
            {translate("settingsResAddEventType")}
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {eventTypes.map((eventType, index) => (
            <div
              key={`${eventType.id}-${index}`}
              className="rounded-xl border border-gray-100 p-3 dark:border-gray-700"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  ID: {eventType.id}
                </span>
                <button
                  type="button"
                  onClick={() => removeEventType(index)}
                  disabled={eventTypes.length <= 1}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 disabled:opacity-40 dark:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {translate("settingsResRemoveEventType")}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {GUEST_RESERVATION_LANGS.map((lang) => (
                  <label key={lang} className="block text-xs">
                    <span className="text-gray-500 dark:text-gray-400">
                      {GUEST_LANG_LABELS[lang]}
                    </span>
                    <input
                      type="text"
                      value={eventType.labels[lang]}
                      onChange={(event) =>
                        updateEventTypeLabel(index, lang, event.target.value)
                      }
                      className="pos-input mt-1"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {translate("settingsResGuestTexts")}
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {translate("settingsResGuestTextsHint")}
        </p>
        <div className="mt-4 space-y-5">
          {(
            [
              { key: "emailHint" as const, labelKey: "settingsResEmailHint" as const },
              { key: "successTitle" as const, labelKey: "settingsResSuccessTitle" as const },
              { key: "successBody" as const, labelKey: "settingsResSuccessBody" as const },
              { key: "successEmailSent" as const, labelKey: "settingsResSuccessEmailSent" as const },
              { key: "successManageLink" as const, labelKey: "settingsResSuccessManageLink" as const },
              { key: "gdprConsent" as const, labelKey: "settingsResGdprConsent" as const },
            ] as const
          ).map((row) => (
            <div key={row.key} className="rounded-xl border border-gray-100 p-3 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {translate(row.labelKey)}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {GUEST_RESERVATION_LANGS.map((lang) => (
                  <label key={lang} className="block text-xs">
                    <span className="text-gray-500 dark:text-gray-400">
                      {GUEST_LANG_LABELS[lang]}
                    </span>
                    {row.key === "successBody" || row.key === "gdprConsent" ? (
                      <textarea
                        rows={3}
                        value={guestTexts[row.key][lang]}
                        onChange={(event) =>
                          updateGuestText(row.key, lang, event.target.value)
                        }
                        className="pos-input mt-1"
                      />
                    ) : (
                      <input
                        type="text"
                        value={guestTexts[row.key][lang]}
                        onChange={(event) =>
                          updateGuestText(row.key, lang, event.target.value)
                        }
                        className="pos-input mt-1"
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
