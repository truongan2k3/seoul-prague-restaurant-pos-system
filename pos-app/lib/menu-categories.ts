/** Exact menu categories for JIN CHENG */
export const MENU_CATEGORIES = [
  "BBQ Grill",
  "Grill Sets",
  "Hot Pot",
  "Rice & Dolsot",
  "Korean Kitchen I",
  "Korean Kitchen II",
  "Sushi I",
  "Sushi II",
  "Soups & Stews",
  "Drinks I",
  "Drinks II",
] as const;

export type MenuCategory = (typeof MENU_CATEGORIES)[number];

export const DEFAULT_MENU_CATEGORY: MenuCategory = "Hot Pot";
