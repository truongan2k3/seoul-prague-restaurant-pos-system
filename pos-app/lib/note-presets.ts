import type { LanguageCode, MenuItem, NotePreset } from "@/lib/types";
import { translateNoteToChineseAction } from "@/src/lib/translate-actions";

export function presetLabel(preset: NotePreset, language: LanguageCode): string {
  if (language === "cs") return preset.labelCz.trim() || preset.labelEn;
  if (language === "zh") return preset.labelZh.trim() || preset.labelEn;
  return preset.labelEn;
}

export function buildNotesFromPresets(
  presets: NotePreset[],
  selectedIds: string[],
  freeText: string,
  language: LanguageCode,
): { note: string; noteTranslated: string } {
  const selected = presets.filter((preset) => selectedIds.includes(preset.id));
  const presetLabels = selected.map((preset) => presetLabel(preset, language));
  const presetZh = selected.map((preset) => preset.labelZh.trim());
  const trimmedFree = freeText.trim();

  const note = [...presetLabels, trimmedFree].filter(Boolean).join(", ");
  const noteTranslated = [...presetZh, trimmedFree].filter(Boolean).join(", ");

  return { note, noteTranslated };
}

export async function finalizeNoteTranslation(
  presets: NotePreset[],
  selectedIds: string[],
  freeText: string,
  language: LanguageCode,
  options?: { translate?: boolean },
): Promise<{ note: string; noteTranslated: string }> {
  const selected = presets.filter((preset) => selectedIds.includes(preset.id));
  const presetLabels = selected.map((preset) => presetLabel(preset, language));
  const trimmedFree = freeText.trim();
  const note = [...presetLabels, trimmedFree].filter(Boolean).join(", ");

  if (!options?.translate) {
    return { note, noteTranslated: note };
  }

  const presetZh = await Promise.all(
    selected.map(async (preset) => {
      const zh = preset.labelZh.trim();
      if (zh) return zh;
      const source = preset.labelEn.trim() || preset.labelCz.trim();
      return source ? translateNoteToChineseAction(source) : "";
    }),
  );

  let translatedFree = "";
  if (trimmedFree) {
    translatedFree = await translateNoteToChineseAction(trimmedFree);
  }

  const noteTranslated = [...presetZh, translatedFree].filter(Boolean).join(", ");

  return { note, noteTranslated };
}

export function togglePresetId(selectedIds: string[], presetId: string): string[] {
  return selectedIds.includes(presetId)
    ? selectedIds.filter((id) => id !== presetId)
    : [...selectedIds, presetId];
}

/**
 * Filter note presets for a menu item.
 * undefined allowedSpecialRequestIds = all presets (legacy default).
 */
export function presetsForMenuItem(
  presets: NotePreset[],
  item: Pick<MenuItem, "customizationConfig"> | null | undefined,
): NotePreset[] {
  const allowed = item?.customizationConfig?.allowedSpecialRequestIds;
  if (allowed == null) return presets;
  const allowedSet = new Set(allowed);
  return presets.filter((preset) => allowedSet.has(preset.id));
}
