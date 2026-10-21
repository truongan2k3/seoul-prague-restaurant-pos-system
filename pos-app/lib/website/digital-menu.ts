import source from "@/lib/website/digital-menu-source.json";
import en from "@/lib/i18n/digital-menu/en.json";
import cs from "@/lib/i18n/digital-menu/cs.json";
import vi from "@/lib/i18n/digital-menu/vi.json";
import de from "@/lib/i18n/digital-menu/de.json";
import ko from "@/lib/i18n/digital-menu/ko.json";

export type DigitalMenuLanguage = "en" | "cs" | "vi" | "de" | "ko";
export const DIGITAL_MENU_LANGUAGES: { code: DigitalMenuLanguage; flag: string; label: string }[] = [
  { code: "en", flag: "🇬🇧", label: "English" }, { code: "cs", flag: "🇨🇿", label: "Čeština" },
  { code: "vi", flag: "🇻🇳", label: "Tiếng Việt" }, { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "ko", flag: "🇰🇷", label: "한국어" },
];
export type DigitalMenuItem = {
  id: string; name: string; description?: string; details?: string[];
  prices: { czk: number; portion?: string }[]; tags?: string[]; spicy?: boolean;
};
export type DigitalMenuGroup = { id: string; title: string; items: DigitalMenuItem[]; tags?: string[] };
export type DigitalMenuCategory = {
  id: string; title: string; subtitle: string; page: number;
  groups: DigitalMenuGroup[]; notes?: string[];
};
/** Guest-facing PDF transcription. Never writes or prices operational POS products. */
export const DIGITAL_MENU: DigitalMenuCategory[] = source.categories;
type MenuLocale = {
  ui: typeof en.ui;
  items: Record<string, Pick<DigitalMenuItem, "name" | "description" | "details">>;
  categories: Record<string, { title: string; subtitle?: string; notes?: string[] }>;
  groups: Record<string, string>; tags: Record<string, string>; portions: Record<string, string>;
};
const LOCALES: Record<DigitalMenuLanguage, MenuLocale> = { en, cs, vi, de, ko };
export function isDigitalMenuLanguage(value: unknown): value is DigitalMenuLanguage {
  return DIGITAL_MENU_LANGUAGES.some((option) => option.code === value);
}
export function digitalMenuCopy(language: DigitalMenuLanguage): MenuLocale { return LOCALES[language] ?? en; }
export function localizedDigitalMenu(language: DigitalMenuLanguage): DigitalMenuCategory[] {
  const copy = digitalMenuCopy(language);
  return DIGITAL_MENU.map((category) => ({ ...category, ...copy.categories[category.id],
    groups: category.groups.map((group) => ({ ...group, title: copy.groups[group.id] ?? group.title,
      items: group.items.map((item) => ({ ...item, ...copy.items[item.id], id: item.id, prices: item.prices })),
    })),
  }));
}
export function normalizeMenuSearch(value: string) {
  return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}
