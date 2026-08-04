import type { LanguageCode, NotePreset } from "@/lib/types";
import { translateNoteToChinese } from "@/src/lib/translator";

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
): Promise<{ note: string; noteTranslated: string }> {
  const selected = presets.filter((preset) => selectedIds.includes(preset.id));
  const presetLabels = selected.map((preset) => presetLabel(preset, language));
  const presetZh = selected.map((preset) => preset.labelZh.trim());
  const trimmedFree = freeText.trim();

  let translatedFree = "";
  if (trimmedFree) {
    translatedFree = await translateNoteToChinese(trimmedFree);
  }

  const note = [...presetLabels, trimmedFree].filter(Boolean).join(", ");
  const noteTranslated = [...presetZh, translatedFree || trimmedFree].filter(Boolean).join(", ");

  return { note, noteTranslated };
}

export function togglePresetId(selectedIds: string[], presetId: string): string[] {
  return selectedIds.includes(presetId)
    ? selectedIds.filter((id) => id !== presetId)
    : [...selectedIds, presetId];
}
