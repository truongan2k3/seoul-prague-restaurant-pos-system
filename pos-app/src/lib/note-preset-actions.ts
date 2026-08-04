import type { NotePreset } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

export type NotePresetInput = {
  labelEn: string;
  labelCz: string;
  labelZh: string;
  displayOrder?: number;
  active?: boolean;
};

function mapRow(row: {
  id: string;
  label_en: string;
  label_cz: string | null;
  label_zh: string;
  display_order: number;
  active: boolean;
}): NotePreset {
  return {
    id: row.id,
    labelEn: row.label_en,
    labelCz: row.label_cz ?? row.label_en,
    labelZh: row.label_zh,
    displayOrder: row.display_order,
    active: row.active,
  };
}

export async function fetchNotePresets() {
  return supabase
    .from("note_presets")
    .select("*")
    .eq("active", true)
    .order("display_order")
    .order("label_en");
}

export function mapNotePresetsResponse(
  data: Parameters<typeof mapRow>[0][] | null,
): NotePreset[] {
  return (data ?? []).map(mapRow);
}

export async function fetchAllNotePresetsAdmin() {
  return supabase.from("note_presets").select("*").order("display_order").order("label_en");
}

export async function createNotePreset(input: NotePresetInput) {
  return supabase
    .from("note_presets")
    .insert({
      label_en: input.labelEn.trim(),
      label_cz: input.labelCz.trim() || null,
      label_zh: input.labelZh.trim(),
      display_order: input.displayOrder ?? 0,
      active: input.active ?? true,
    })
    .select("*")
    .single();
}

export async function updateNotePreset(id: string, input: NotePresetInput) {
  return supabase
    .from("note_presets")
    .update({
      label_en: input.labelEn.trim(),
      label_cz: input.labelCz.trim() || null,
      label_zh: input.labelZh.trim(),
      display_order: input.displayOrder ?? 0,
      active: input.active ?? true,
    })
    .eq("id", id)
    .select("*")
    .single();
}

export async function deleteNotePreset(id: string) {
  return supabase.from("note_presets").delete().eq("id", id);
}

export async function updateNotePresetOrder(items: { id: string; displayOrder: number }[]) {
  const results = await Promise.all(
    items.map(({ id, displayOrder }) =>
      supabase.from("note_presets").update({ display_order: displayOrder }).eq("id", id),
    ),
  );
  const failed = results.find((result) => result.error);
  return failed ?? { error: null };
}
