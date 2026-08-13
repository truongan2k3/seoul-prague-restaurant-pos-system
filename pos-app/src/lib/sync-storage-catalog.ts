import {
  DEFAULT_NOTE_PRESETS,
  DEFAULT_SIDE_DISH_GROUP,
  notePresetKey,
  optionGroupKey,
  RETIRED_NOTE_PRESET_LABELS,
} from "@/lib/storage-catalog-defaults";
import {
  createNotePreset,
  updateNotePreset,
  type NotePresetInput,
} from "@/src/lib/note-preset-actions";
import {
  createOptionGroupLibraryEntry,
  deleteOptionGroupLibraryEntry,
  updateOptionGroupLibraryEntry,
} from "@/src/lib/option-group-library-actions";
import { supabase } from "@/src/lib/supabase";

type SyncResult = { error: Error | null; changed: boolean };

let synced = false;
/** Serializes concurrent sync calls (avoids duplicate inserts from parallel fetches). */
let syncChain: Promise<SyncResult> = Promise.resolve({ error: null, changed: false });

function pickKeeper<T extends { id: string; active?: boolean | null; display_order?: number | null }>(
  rows: T[],
): T {
  return [...rows].sort((a, b) => {
    const aActive = a.active ? 1 : 0;
    const bActive = b.active ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const aOrder = a.display_order ?? 999;
    const bOrder = b.display_order ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.id.localeCompare(b.id);
  })[0];
}

async function dedupeNotePresets(): Promise<boolean> {
  const { data, error } = await supabase
    .from("note_presets")
    .select("id, label_en, active, display_order");
  if (error) {
    if (error.code === "42P01") return false;
    throw error;
  }

  const grouped = new Map<string, NonNullable<typeof data>>();
  for (const row of data ?? []) {
    const key = notePresetKey(String(row.label_en ?? ""));
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  let changed = false;
  for (const rows of grouped.values()) {
    if (rows.length <= 1) continue;
    const keep = pickKeeper(rows);
    const removeIds = rows.filter((row) => row.id !== keep.id).map((row) => row.id);
    if (removeIds.length === 0) continue;
    const { error: deleteError } = await supabase.from("note_presets").delete().in("id", removeIds);
    if (!deleteError) changed = true;
  }
  return changed;
}

async function migrateOptionGroupLibraryId(fromId: string, toId: string): Promise<void> {
  if (fromId === toId) return;
  const { data: items, error } = await supabase
    .from("menu_items")
    .select("id, customization_config")
    .not("customization_config", "is", null);
  if (error || !items?.length) return;

  for (const item of items) {
    const config = item.customization_config as {
      optionGroupLibraryIds?: string[];
      [key: string]: unknown;
    } | null;
    const ids = config?.optionGroupLibraryIds;
    if (!Array.isArray(ids) || !ids.includes(fromId)) continue;

    const nextIds = [...new Set(ids.map((id) => (id === fromId ? toId : id)))];
    await supabase
      .from("menu_items")
      .update({
        customization_config: {
          ...config,
          optionGroupLibraryIds: nextIds,
        },
      })
      .eq("id", item.id);
  }
}

async function dedupeOptionGroups(): Promise<boolean> {
  const { data, error } = await supabase
    .from("option_group_library")
    .select("id, name_en, active, display_order");
  if (error) {
    if (error.code === "42P01") return false;
    throw error;
  }

  const grouped = new Map<string, NonNullable<typeof data>>();
  for (const row of data ?? []) {
    const key = optionGroupKey(String(row.name_en ?? ""));
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  let changed = false;
  for (const rows of grouped.values()) {
    if (rows.length <= 1) continue;
    const keep = pickKeeper(rows);
    for (const row of rows) {
      if (row.id === keep.id) continue;
      await migrateOptionGroupLibraryId(row.id, keep.id);
      const { error: deleteError } = await deleteOptionGroupLibraryEntry(row.id);
      if (!deleteError) changed = true;
    }
  }
  return changed;
}

async function upsertNotePreset(
  input: NotePresetInput,
  existingByKey: Map<string, { id: string }>,
): Promise<boolean> {
  const key = notePresetKey(input.labelEn);
  const existing = existingByKey.get(key);
  if (existing) {
    const { error } = await updateNotePreset(existing.id, { ...input, active: true });
    return !error;
  }
  const { data, error } = await createNotePreset({ ...input, active: true });
  if (!error && data?.id) {
    existingByKey.set(key, { id: data.id });
  }
  return !error;
}

async function syncNotePresets(): Promise<boolean> {
  let changed = await dedupeNotePresets();

  const { data, error } = await supabase.from("note_presets").select("id, label_en, active");
  if (error) {
    if (error.code === "42P01") return changed;
    throw error;
  }

  const existingByKey = new Map<string, { id: string }>();
  for (const row of data ?? []) {
    const key = notePresetKey(String(row.label_en ?? ""));
    if (!existingByKey.has(key)) {
      existingByKey.set(key, { id: row.id });
    }
  }

  for (const preset of DEFAULT_NOTE_PRESETS) {
    const ok = await upsertNotePreset(preset, existingByKey);
    if (ok) changed = true;
  }

  for (const row of data ?? []) {
    const key = notePresetKey(String(row.label_en ?? ""));
    if (!RETIRED_NOTE_PRESET_LABELS.has(key) || !row.active) continue;
    const { error: retireError } = await supabase
      .from("note_presets")
      .update({ active: false })
      .eq("id", row.id);
    if (!retireError) changed = true;
  }

  return changed;
}

async function syncSideDishGroup(): Promise<boolean> {
  let changed = await dedupeOptionGroups();

  const { data, error } = await supabase
    .from("option_group_library")
    .select("id, name_en");

  if (error) {
    if (error.code === "42P01") return changed;
    throw error;
  }

  const key = optionGroupKey(DEFAULT_SIDE_DISH_GROUP.nameEn);
  const matches = (data ?? []).filter(
    (row) => optionGroupKey(String(row.name_en ?? "")) === key,
  );
  const existing = matches[0];

  if (existing) {
    const { error: updateError } = await updateOptionGroupLibraryEntry(
      existing.id,
      DEFAULT_SIDE_DISH_GROUP,
    );
    if (!updateError) changed = true;
    return changed;
  }

  const { error: createError } = await createOptionGroupLibraryEntry(DEFAULT_SIDE_DISH_GROUP);
  if (!createError) changed = true;
  return changed;
}

async function runStorageCatalogSync(): Promise<SyncResult> {
  try {
    const presetsChanged = await syncNotePresets();
    const groupChanged = await syncSideDishGroup();
    synced = true;
    return { error: null, changed: presetsChanged || groupChanged };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    console.warn("[StorageCatalog] Sync failed:", error.message);
    return { error, changed: false };
  }
}

/** Upsert restaurant defaults into Supabase; dedupes legacy duplicates (once per session). */
export function ensureStorageCatalogSynced(): Promise<SyncResult> {
  if (synced) return Promise.resolve({ error: null, changed: false });

  syncChain = syncChain.then(async (prev) => {
    if (synced) return prev;
    return runStorageCatalogSync();
  });

  return syncChain;
}

/** Force re-sync after deploy (optional). */
export function resetStorageCatalogSync(): void {
  synced = false;
}
