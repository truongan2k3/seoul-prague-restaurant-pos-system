"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MarqueeSequenceTrack } from "@/components/marquee-sequence-track";
import { useApp } from "@/contexts/app-context";
import {
  MARQUEE_SPEED_MAX,
  MARQUEE_SPEED_MIN,
  MARQUEE_SURFACES,
  fromDatetimeLocalValue,
  marqueeFontFamilyStack,
  toDatetimeLocalValue,
  type MarqueeSurface,
} from "@/lib/marquee-settings";
import { RECEIPT_FONT_OPTIONS } from "@/lib/receipt-print-styles";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { MarqueeConfigs, MarqueeSurfaceConfig, ReceiptFontFamily } from "@/lib/types";
import { filterButtonClass } from "@/lib/theme-classes";

const RECEIPT_FONT_LABEL_KEYS: Record<ReceiptFontFamily, TranslationKey> = {
  consolas: "settingsReceiptFontConsolas",
  courier: "settingsReceiptFontCourier",
  arial: "settingsReceiptFontArial",
  tahoma: "settingsReceiptFontTahoma",
  lucida: "settingsReceiptFontLucida",
  georgia: "settingsReceiptFontGeorgia",
};

const SURFACE_LABEL_KEYS: Record<MarqueeSurface, TranslationKey> = {
  pos: "settingsMarqueeOnPos",
  client: "settingsMarqueeOnClient",
  kds: "settingsMarqueeOnKds",
  bar: "settingsMarqueeOnBar",
};

interface MarqueeSettingsEditorProps {
  value: MarqueeConfigs;
  onChange: (next: MarqueeConfigs) => void;
}

function updateSurface(
  configs: MarqueeConfigs,
  surface: MarqueeSurface,
  patch: Partial<MarqueeSurfaceConfig>,
): MarqueeConfigs {
  return {
    ...configs,
    [surface]: { ...configs[surface], ...patch },
  };
}

export function MarqueeSettingsEditor({ value, onChange }: MarqueeSettingsEditorProps) {
  const { translate } = useApp();
  const [activeSurface, setActiveSurface] = useState<MarqueeSurface>("pos");
  const config = value[activeSurface];

  const setConfig = (patch: Partial<MarqueeSurfaceConfig>) => {
    onChange(updateSurface(value, activeSurface, patch));
  };

  const setMessage = (messageIndex: number, text: string) => {
    const next = [...config.messages];
    next[messageIndex] = text;
    setConfig({ messages: next });
  };

  const addMessage = () => {
    setConfig({ messages: [...config.messages, ""] });
  };

  const removeMessage = (messageIndex: number) => {
    const next = config.messages.filter((_, index) => index !== messageIndex);
    setConfig({ messages: next.length > 0 ? next : [""] });
  };

  const previewMessages = config.messages.map((message) => message.trim()).filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {MARQUEE_SURFACES.map((surface) => (
          <button
            key={surface}
            type="button"
            onClick={() => setActiveSurface(surface)}
            className={filterButtonClass(activeSurface === surface)}
          >
            {translate(SURFACE_LABEL_KEYS[surface])}
            {value[surface].enabled && previewMessages.length > 0 ? " •" : ""}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {translate("settingsMarqueePerSurfaceHint")}
      </p>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
        <span className="text-sm text-gray-800 dark:text-gray-200">
          {translate("settingsMarqueeEnabled")}
        </span>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(event) => setConfig({ enabled: event.target.checked })}
          className="h-4 w-4 rounded border-gray-300"
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {translate("settingsMarqueeMessages")}
          </span>
          <button
            type="button"
            onClick={addMessage}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium dark:border-gray-600"
          >
            <Plus className="h-3.5 w-3.5" />
            {translate("settingsMarqueeAddMessage")}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {translate("settingsMarqueeMessagesHint")}
        </p>
        {config.messages.map((message, index) => (
          <div key={`${activeSurface}-msg-${index}`} className="flex gap-2">
            <textarea
              value={message}
              onChange={(event) => setMessage(index, event.target.value)}
              rows={2}
              placeholder={translate("settingsMarqueeTextPlaceholder")}
              className="pos-input min-h-[56px] flex-1 resize-y"
            />
            <button
              type="button"
              disabled={config.messages.length <= 1}
              onClick={() => removeMessage(index)}
              className="self-start rounded-lg border border-red-200 p-2 text-red-600 disabled:opacity-40 dark:border-red-900"
              aria-label={translate("delete")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-gray-500 dark:text-gray-400">{translate("settingsMarqueeSpeed")}</span>
          <input
            type="number"
            min={MARQUEE_SPEED_MIN}
            max={MARQUEE_SPEED_MAX}
            value={config.durationSeconds}
            onChange={(event) => setConfig({ durationSeconds: Number(event.target.value) })}
            className="pos-input mt-1"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {translate("settingsMarqueeSpeedHint")}
          </p>
        </label>

        <label className="block text-sm">
          <span className="text-gray-500 dark:text-gray-400">{translate("settingsMarqueeFont")}</span>
          <select
            value={config.fontFamily}
            onChange={(event) => setConfig({ fontFamily: event.target.value as ReceiptFontFamily })}
            className="pos-input mt-1"
          >
            {RECEIPT_FONT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {translate(RECEIPT_FONT_LABEL_KEYS[option.id])}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-gray-500 dark:text-gray-400">{translate("settingsMarqueeEndAt")}</span>
        <input
          type="datetime-local"
          value={toDatetimeLocalValue(config.endAt)}
          onChange={(event) => setConfig({ endAt: fromDatetimeLocalValue(event.target.value) })}
          className="pos-input mt-1"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {translate("settingsMarqueeEndAtHint")}
        </p>
      </label>

      {config.enabled && previewMessages.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-amber-300 bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40">
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            {translate("settingsMarqueePreview")}
          </p>
          <div className="overflow-hidden py-2">
            <MarqueeSequenceTrack
              messages={previewMessages}
              durationSeconds={config.durationSeconds}
              fontFamily={marqueeFontFamilyStack(config.fontFamily)}
              textClassName="px-6 text-sm font-semibold text-amber-950 dark:text-amber-100"
            />
          </div>
        </div>
      )}
    </div>
  );
}
