import type { MenuOptionChoice, OptionGroupLibraryEntry } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

export type OptionGroupLibraryInput = {
  nameEn: string;
  nameCz: string;
  nameZh: string;
  required?: boolean;
  multi?: boolean;
  options: MenuOptionChoice[];
  displayOrder?: number;
  active?: boolean;
};

type OptionGroupLibraryRow = {
  id: string;
  name_en: string;
  name_cz: string | null;
  name_zh: string | null;
  required: boolean | null;
  multi: boolean | null;
  options: MenuOptionChoice[] | null;
  display_order: number | null;
  active: boolean | null;
};

function normalizeOptions(options: MenuOptionChoice[] | null | undefined): MenuOptionChoice[] {
  if (!Array.isArray(options)) return [];
  return options.map((option, index) => ({
    id: option.id?.trim() || `opt-${index}`,
    nameEn: option.nameEn?.trim() || "",
    nameCz: option.nameCz?.trim() || option.nameEn?.trim() || "",
    nameZh: option.nameZh?.trim() || option.nameEn?.trim() || "",
    price: option.price,
    priceDelta: option.priceDelta ?? 0,
    default: Boolean(option.default),
  }));
}

export function mapOptionGroupLibraryRow(row: OptionGroupLibraryRow): OptionGroupLibraryEntry {
  return {
    id: row.id,
    nameEn: row.name_en?.trim() || "",
    nameCz: row.name_cz?.trim() || row.name_en?.trim() || "",
    nameZh: row.name_zh?.trim() || row.name_en?.trim() || "",
    required: row.required ?? true,
    multi: row.multi ?? false,
    options: normalizeOptions(row.options),
    displayOrder: row.display_order ?? 0,
    active: row.active ?? true,
  };
}

export function mapOptionGroupLibraryResponse(
  data: OptionGroupLibraryRow[] | null,
): OptionGroupLibraryEntry[] {
  return (data ?? [])
    .map(mapOptionGroupLibraryRow)
    .sort(
      (a, b) =>
        a.displayOrder - b.displayOrder || a.nameEn.localeCompare(b.nameEn),
    );
}

export async function fetchOptionGroupLibrary(activeOnly = false) {
  let query = supabase
    .from("option_group_library")
    .select("*")
    .order("display_order")
    .order("name_en");
  if (activeOnly) query = query.eq("active", true);
  return query;
}

export async function createOptionGroupLibraryEntry(input: OptionGroupLibraryInput) {
  return supabase
    .from("option_group_library")
    .insert({
      name_en: input.nameEn.trim(),
      name_cz: input.nameCz.trim() || input.nameEn.trim(),
      name_zh: input.nameZh.trim() || input.nameEn.trim(),
      required: input.required ?? true,
      multi: input.multi ?? false,
      options: normalizeOptions(input.options),
      display_order: input.displayOrder ?? 0,
      active: input.active ?? true,
    })
    .select("*")
    .single();
}

export async function updateOptionGroupLibraryEntry(
  id: string,
  input: OptionGroupLibraryInput,
) {
  return supabase
    .from("option_group_library")
    .update({
      name_en: input.nameEn.trim(),
      name_cz: input.nameCz.trim() || input.nameEn.trim(),
      name_zh: input.nameZh.trim() || input.nameEn.trim(),
      required: input.required ?? true,
      multi: input.multi ?? false,
      options: normalizeOptions(input.options),
      display_order: input.displayOrder ?? 0,
      active: input.active ?? true,
    })
    .eq("id", id)
    .select("*")
    .single();
}

export async function deleteOptionGroupLibraryEntry(id: string) {
  return supabase.from("option_group_library").delete().eq("id", id);
}

export const emptyOptionGroupLibraryInput: OptionGroupLibraryInput = {
  nameEn: "",
  nameCz: "",
  nameZh: "",
  required: true,
  multi: false,
  options: [],
  displayOrder: 0,
  active: true,
};
