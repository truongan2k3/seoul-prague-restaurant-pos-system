import type {
  LanguageCode,
  MenuCustomizationConfig,
  MenuItem,
  MenuOptionChoice,
  MenuOptionGroup,
  OptionGroupLibraryEntry,
  SelectedMenuOption,
} from "@/lib/types";

export function libraryEntryToOptionGroup(
  entry: OptionGroupLibraryEntry,
): MenuOptionGroup {
  return {
    id: entry.id,
    nameEn: entry.nameEn,
    nameCz: entry.nameCz,
    nameZh: entry.nameZh,
    required: entry.required,
    multi: entry.multi,
    options: entry.options.map((option) => ({ ...option })),
  };
}

/**
 * Resolve library references into embedded optionGroups for order/print/customize.
 * Legacy inline-only configs (no optionGroupLibraryIds) pass through unchanged.
 */
type LegacyCustomizationConfig = MenuCustomizationConfig & {
  freeAddOn?: unknown;
};

function stripLegacyFreeAddOn(config: LegacyCustomizationConfig): MenuCustomizationConfig {
  const { freeAddOn: _ignored, ...rest } = config;
  return rest;
}

export function resolveCustomizationConfig(
  config: MenuCustomizationConfig | undefined,
  library: OptionGroupLibraryEntry[],
): MenuCustomizationConfig | undefined {
  if (!config) return undefined;
  config = stripLegacyFreeAddOn(config as LegacyCustomizationConfig);

  const libraryIds = config.optionGroupLibraryIds ?? [];
  if (libraryIds.length === 0) {
    const hasContent = config.optionGroups && config.optionGroups.length > 0;
    return hasContent ? config : undefined;
  }

  const byId = new Map(library.map((entry) => [entry.id, entry]));
  const fromLibrary: MenuOptionGroup[] = [];
  for (const id of libraryIds) {
    const entry = byId.get(id);
    if (entry && entry.active !== false) {
      fromLibrary.push(libraryEntryToOptionGroup(entry));
    }
  }

  const libraryIdSet = new Set(libraryIds);
  const inlineOnly = (config.optionGroups ?? []).filter(
    (group) => !libraryIdSet.has(group.id),
  );

  const optionGroups = [...fromLibrary, ...inlineOnly];
  const resolved: MenuCustomizationConfig = {
    ...config,
    optionGroups,
  };

  const hasContent =
    optionGroups.length > 0 || (resolved.allowedSpecialRequestIds?.length ?? 0) > 0;
  return hasContent ? resolved : { ...resolved, optionGroups };
}

export function applyOptionGroupLibrary(
  item: MenuItem,
  library: OptionGroupLibraryEntry[],
): MenuItem {
  if (!item.customizationConfig) return item;
  const resolved = resolveCustomizationConfig(item.customizationConfig, library);
  if (resolved === item.customizationConfig) return item;
  return { ...item, customizationConfig: resolved };
}

export function applyOptionGroupLibraryToItems(
  items: MenuItem[],
  library: OptionGroupLibraryEntry[],
): MenuItem[] {
  if (!library.length) return items;
  return items.map((item) => applyOptionGroupLibrary(item, library));
}

/** Strip resolved library groups before save so DB keeps references + true inline only. */
export function customizationConfigForSave(
  config: MenuCustomizationConfig | undefined,
): MenuCustomizationConfig | undefined {
  if (!config) return undefined;
  const libraryIds = config.optionGroupLibraryIds ?? [];
  const libraryIdSet = new Set(libraryIds);
  const inlineOnly = (config.optionGroups ?? []).filter(
    (group) => !libraryIdSet.has(group.id),
  );

  const next: MenuCustomizationConfig = {
    ...config,
    optionGroupLibraryIds: libraryIds.length > 0 ? libraryIds : undefined,
    optionGroups: inlineOnly.length > 0 ? inlineOnly : undefined,
  };

  if (!next.optionGroupLibraryIds) delete next.optionGroupLibraryIds;
  if (!next.optionGroups?.length) delete next.optionGroups;
  if (next.allowedSpecialRequestIds == null) delete next.allowedSpecialRequestIds;
  delete (next as LegacyCustomizationConfig).freeAddOn;
  if (!next.basePriceFromOptions) delete next.basePriceFromOptions;

  const hasContent =
    Boolean(next.optionGroups?.length) ||
    Boolean(next.optionGroupLibraryIds?.length) ||
    next.allowedSpecialRequestIds != null;

  return hasContent ? next : undefined;
}

export function hasCustomization(item: MenuItem): boolean {
  const config = item.customizationConfig;
  if (!config) return false;
  return Boolean(
    (config.optionGroups && config.optionGroups.length > 0) ||
      (config.optionGroupLibraryIds && config.optionGroupLibraryIds.length > 0),
  );
}

/** Lunch / Món ăn trưa category detection for default protein selection. */
export function isLunchMenuItem(item: Pick<MenuItem, "category">): boolean {
  const name = item.category.trim().toLowerCase();
  return (
    name.includes("lunch") ||
    name.includes("trưa") ||
    name.includes("trua") ||
    name.includes("món ăn trưa")
  );
}

function isChickenOption(option: MenuOptionChoice): boolean {
  const haystack = `${option.id} ${option.nameEn} ${option.nameCz} ${option.nameZh}`.toLowerCase();
  return (
    option.id === "chicken" ||
    haystack.includes("chicken") ||
    haystack.includes("kuřecí") ||
    haystack.includes("kureci") ||
    haystack.includes("鸡肉")
  );
}

/** Per option-group: selected option id(s). Multi groups may have several. */
export type OptionGroupSelections = Record<string, string[]>;

export function getDefaultSelections(
  config: MenuCustomizationConfig,
  item?: Pick<MenuItem, "category">,
): OptionGroupSelections {
  const preferChicken = item ? isLunchMenuItem(item) : false;
  const selections: OptionGroupSelections = {};

  for (const group of config.optionGroups ?? []) {
    const chicken = preferChicken ? group.options.find(isChickenOption) : undefined;
    const defaultOption =
      chicken ?? group.options.find((option) => option.default) ?? group.options[0];
    if (defaultOption) selections[group.id] = [defaultOption.id];
  }

  return selections;
}

export function resolveSelectedOptions(
  config: MenuCustomizationConfig,
  selections: OptionGroupSelections,
): SelectedMenuOption[] {
  const resolved: SelectedMenuOption[] = [];
  for (const group of config.optionGroups ?? []) {
    const optionIds = selections[group.id] ?? [];
    for (const optionId of optionIds) {
      const option = group.options.find((entry) => entry.id === optionId);
      if (!option) continue;
      resolved.push({
        groupId: group.id,
        optionId: option.id,
        nameEn: option.nameEn,
        nameCz: option.nameCz,
        nameZh: option.nameZh,
        price: option.price,
        priceDelta: option.priceDelta ?? 0,
      });
    }
  }
  return resolved;
}

export function computeCustomizedPrice(
  item: MenuItem,
  selected: SelectedMenuOption[],
): number {
  const config = item.customizationConfig;
  if (!config) return item.price;

  if (config.basePriceFromOptions) {
    const priced = selected.find((entry) => entry.price != null);
    const base = priced?.price ?? item.price;
    const deltas = selected.reduce((sum, entry) => sum + (entry.priceDelta ?? 0), 0);
    return base + deltas;
  }

  const deltas = selected.reduce(
    (sum, entry) => sum + (entry.priceDelta ?? 0) + (entry.price ?? 0),
    0,
  );
  return item.price + deltas;
}

export function optionLabel(
  option: Pick<MenuOptionChoice, "nameEn" | "nameCz" | "nameZh"> & { nameZh?: string },
  language: LanguageCode,
): string {
  if (language === "cs") return option.nameCz.trim() || option.nameEn;
  if (language === "zh") return option.nameZh.trim() || option.nameEn;
  return option.nameEn;
}

export function buildCustomizationSignature(
  menuItemId: string,
  selections: OptionGroupSelections,
): string {
  const normalized: OptionGroupSelections = {};
  for (const groupId of Object.keys(selections).sort()) {
    normalized[groupId] = [...selections[groupId]].sort();
  }
  return JSON.stringify({ menuItemId, selections: normalized });
}

export function buildLineDisplayName(
  baseName: string,
  selected: SelectedMenuOption[],
  language: LanguageCode,
): string {
  const parts = [baseName];
  for (const entry of selected) {
    parts.push(optionLabel(entry, language));
  }
  return parts.join(" · ");
}

export function isIncludedRiceOption(option: SelectedMenuOption): boolean {
  if (option.optionId === "rice") return true;
  const en = option.nameEn.trim().toLowerCase();
  if (en.includes("rice (included)") || en === "rice") return true;
  if (option.nameZh.trim() === "米饭") return true;
  const cz = option.nameCz.trim().toLowerCase();
  if ((option.priceDelta ?? 0) === 0 && cz.includes("rýže")) return true;
  return false;
}

export function kitchenPrintOptions(
  selected: SelectedMenuOption[] | undefined,
): SelectedMenuOption[] {
  return (selected ?? []).filter((option) => !isIncludedRiceOption(option));
}

export function buildKitchenModifierText(selected: SelectedMenuOption[]): string {
  return kitchenPrintOptions(selected)
    .map((entry) => entry.nameZh.trim() || entry.nameEn)
    .join(" · ");
}

export function buildKitchenModifierTextEn(selected: SelectedMenuOption[]): string {
  return kitchenPrintOptions(selected)
    .map((entry) => entry.nameEn.trim() || entry.nameCz.trim() || entry.nameZh)
    .join(" · ");
}

export function mergeNoteWithKitchenModifiers(
  note: string | undefined,
  noteTranslated: string | undefined,
  kitchenModifiersZh: string,
  kitchenModifiersEn?: string,
): { notes?: string; notesTranslated?: string } {
  const zhPart = kitchenModifiersZh.trim();
  const enPart = (kitchenModifiersEn ?? kitchenModifiersZh).trim();

  if (!zhPart && !enPart) {
    return {
      notes: note?.trim() || undefined,
      notesTranslated: noteTranslated?.trim() || undefined,
    };
  }

  const notes = [enPart, note?.trim()].filter(Boolean).join(" · ");
  const notesTranslated = [zhPart, noteTranslated?.trim()].filter(Boolean).join(" · ");
  return { notes: notes || undefined, notesTranslated: notesTranslated || undefined };
}
