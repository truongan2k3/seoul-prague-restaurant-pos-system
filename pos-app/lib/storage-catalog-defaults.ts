import type { MenuOptionChoice } from "@/lib/types";
import type { NotePresetInput } from "@/src/lib/note-preset-actions";
import type { OptionGroupLibraryInput } from "@/src/lib/option-group-library-actions";

/** Canonical special-request presets (EN / CZ / ZH). */
export const DEFAULT_NOTE_PRESETS: NotePresetInput[] = [
  { labelEn: "No Spicy", labelCz: "Nepálivé / Bez chilli", labelZh: "不辣", displayOrder: 1 },
  { labelEn: "Little Spicy", labelCz: "Mírně pálivé / Málo chilli", labelZh: "微辣", displayOrder: 2 },
  { labelEn: "Very Spicy", labelCz: "Hodně pálivé", labelZh: "特辣", displayOrder: 3 },
  { labelEn: "Extra Spicy", labelCz: "Extra pálivé / Velmi hodně pálivé", labelZh: "超辣", displayOrder: 4 },
  { labelEn: "No Coriander", labelCz: "Bez koriandru", labelZh: "不要香菜", displayOrder: 5 },
  { labelEn: "No Spring Onions", labelCz: "Bez jarní cibulky", labelZh: "不要葱花", displayOrder: 6 },
  { labelEn: "No Vegetable / Salad", labelCz: "Bez zeleniny / salátu", labelZh: "不要蔬菜", displayOrder: 7 },
  { labelEn: "Sauces Separate", labelCz: "Omáčka zvlášť", labelZh: "酱汁分开装", displayOrder: 8 },
];

export const RETIRED_NOTE_PRESET_LABELS = new Set([
  "less spicy",
  "no onion",
  "takeaway",
]);

const SIDE_DISH_OPTIONS: MenuOptionChoice[] = [
  {
    id: "rice",
    nameEn: "Rice (included)",
    nameCz: "Rýže (v ceně)",
    nameZh: "米饭",
    priceDelta: 0,
    default: true,
  },
  {
    id: "noodles",
    nameEn: "Fried Noodles",
    nameCz: "Nudle",
    nameZh: "炒面",
    priceDelta: 30,
  },
  {
    id: "rice_noodles",
    nameEn: "Fried Rice Noodles",
    nameCz: "Rýžové nudle",
    nameZh: "炒米粉",
    priceDelta: 30,
  },
  {
    id: "fried_rice",
    nameEn: "Fried Rice",
    nameCz: "Smažená rýže",
    nameZh: "炒饭",
    priceDelta: 30,
  },
  {
    id: "fries",
    nameEn: "French Fries",
    nameCz: "Hranolky",
    nameZh: "炸薯条",
    priceDelta: 30,
  },
  {
    id: "croquettes",
    nameEn: "Potato Croquettes",
    nameCz: "Krokety",
    nameZh: "炸土豆球",
    priceDelta: 30,
  },
];

/** Side-dish swap group (+30 Kč) for lunch / mains. */
export const DEFAULT_SIDE_DISH_GROUP: OptionGroupLibraryInput = {
  nameEn: "Side dish",
  nameCz: "Příloha",
  nameZh: "配菜",
  required: true,
  multi: false,
  options: SIDE_DISH_OPTIONS,
  displayOrder: 1,
  active: true,
};

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

export function notePresetKey(labelEn: string): string {
  return normalizeLabel(labelEn);
}

export function optionGroupKey(nameEn: string): string {
  return normalizeLabel(nameEn);
}
