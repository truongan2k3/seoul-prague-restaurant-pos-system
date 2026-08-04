import type { LanguageCode, MenuItem } from "@/lib/types";
import type {
  MenuCustomizationConfig,
  MenuOptionChoice,
  SelectedMenuOption,
} from "@/lib/types";

export function hasCustomization(item: MenuItem): boolean {
  const config = item.customizationConfig;
  if (!config) return false;
  return Boolean(
    (config.optionGroups && config.optionGroups.length > 0) || config.freeAddOn,
  );
}

export function getDefaultSelections(config: MenuCustomizationConfig): Record<string, string> {
  const selections: Record<string, string> = {};
  for (const group of config.optionGroups ?? []) {
    const defaultOption =
      group.options.find((option) => option.default) ?? group.options[0];
    if (defaultOption) selections[group.id] = defaultOption.id;
  }
  return selections;
}

export function resolveSelectedOptions(
  config: MenuCustomizationConfig,
  selections: Record<string, string>,
): SelectedMenuOption[] {
  const resolved: SelectedMenuOption[] = [];
  for (const group of config.optionGroups ?? []) {
    const optionId = selections[group.id];
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
  selections: Record<string, string>,
  freeAddOnSelected: boolean,
): string {
  return JSON.stringify({ menuItemId, selections, freeAddOnSelected });
}

export function buildLineDisplayName(
  baseName: string,
  selected: SelectedMenuOption[],
  language: LanguageCode,
  freeAddOnSelected?: boolean,
  freeAddOn?: MenuCustomizationConfig["freeAddOn"],
): string {
  const parts = [baseName];
  for (const entry of selected) {
    parts.push(optionLabel(entry, language));
  }
  if (freeAddOnSelected && freeAddOn) {
    parts.push(optionLabel(freeAddOn, language));
  }
  return parts.join(" · ");
}

export function buildKitchenModifierText(
  selected: SelectedMenuOption[],
  freeAddOnSelected: boolean,
  freeAddOn?: MenuCustomizationConfig["freeAddOn"],
): string {
  const parts: string[] = [];
  for (const entry of selected) {
    parts.push(entry.nameZh.trim() || entry.nameEn);
  }
  if (freeAddOnSelected && freeAddOn) {
    parts.push(freeAddOn.nameZh.trim() || freeAddOn.nameEn);
  }
  return parts.join(" · ");
}

export function mergeNoteWithKitchenModifiers(
  note: string | undefined,
  noteTranslated: string | undefined,
  kitchenModifiers: string,
): { notes?: string; notesTranslated?: string } {
  if (!kitchenModifiers) {
    return {
      notes: note?.trim() || undefined,
      notesTranslated: noteTranslated?.trim() || undefined,
    };
  }
  const notes = [kitchenModifiers, note?.trim()].filter(Boolean).join(" · ");
  const notesTranslated = [kitchenModifiers, noteTranslated?.trim()].filter(Boolean).join(" · ");
  return { notes: notes || undefined, notesTranslated: notesTranslated || undefined };
}
