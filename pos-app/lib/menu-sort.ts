import type { MenuCategoryRecord, MenuItem, MenuSortMode } from "@/lib/types";

export function sortCategoriesForDisplay(
  categories: MenuCategoryRecord[],
  mode: MenuSortMode,
): MenuCategoryRecord[] {
  const copy = [...categories];
  if (mode === "alphabetical") {
    return copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }
  return copy.sort(
    (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function sortMenuItemsForDisplay(items: MenuItem[], mode: MenuSortMode): MenuItem[] {
  const copy = [...items];
  if (mode === "alphabetical") {
    return copy.sort((a, b) =>
      a.nameEn.localeCompare(b.nameEn, undefined, { sensitivity: "base" }),
    );
  }
  return copy.sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.nameEn.localeCompare(b.nameEn, undefined, { sensitivity: "base" }),
  );
}
