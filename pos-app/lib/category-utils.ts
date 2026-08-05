import { MENU_CATEGORIES } from "@/lib/menu-categories";
import type { MenuCategoryRecord, MenuItem } from "@/lib/types";

export type ItemTypeFilter = "all" | "dish" | "drink";

export function categoriesForOrdering(categories: MenuCategoryRecord[]): MenuCategoryRecord[] {
  if (categories.length === 0) {
    return MENU_CATEGORIES.map((name, index) => ({
      id: `legacy-${index}`,
      name,
      type: name.startsWith("Drinks") ? "drink" : "dish",
      displayOrder: index,
    }));
  }
  return [...categories].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
  );
}

export function categoryNameById(
  categories: MenuCategoryRecord[],
  categoryId?: string | null,
  fallback = "",
): string {
  if (!categoryId) return fallback;
  return categories.find((c) => c.id === categoryId)?.name ?? fallback;
}

export function resolveItemCategoryName(item: MenuItem, categories: MenuCategoryRecord[]): string {
  return categoryNameById(categories, item.categoryId, item.category);
}

export function filterMenuItems(
  items: MenuItem[],
  categories: MenuCategoryRecord[],
  options: {
    search?: string;
    typeFilter?: ItemTypeFilter;
    categoryFilter?: string;
  },
): MenuItem[] {
  const query = options.search?.trim().toLowerCase() ?? "";
  const typeFilter = options.typeFilter ?? "all";
  const categoryFilter = options.categoryFilter ?? "all";

  return items.filter((item) => {
    if (typeFilter !== "all") {
      const expectedItemType = typeFilter === "dish" ? "food" : "drink";
      if (item.itemType !== expectedItemType) return false;
    }

    if (categoryFilter !== "all") {
      const selectedCategory = categories.find((category) => category.id === categoryFilter);
      const matchesId = item.categoryId === categoryFilter;
      const matchesLegacy =
        !item.categoryId &&
        (item.category === categoryFilter ||
          (selectedCategory != null && item.category === selectedCategory.name));
      if (!matchesId && !matchesLegacy) return false;
    }

    if (!query) return true;

    const catName = resolveItemCategoryName(item, categories);
    const haystack = [
      item.id,
      item.nameEn,
      item.nameCz,
      item.nameZh,
      catName,
      item.category,
      item.descriptionEn ?? "",
      item.descriptionCz ?? "",
      item.descriptionZh ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

export function reorderCategories<T extends { displayOrder: number; name: string }>(
  items: T[],
  sourceIndex: number,
  destinationIndex: number,
): T[] {
  if (sourceIndex === destinationIndex) return items;

  const sorted = [...items].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
  );
  const [moved] = sorted.splice(sourceIndex, 1);
  sorted.splice(destinationIndex, 0, moved);

  return sorted.map((item, index) => ({ ...item, displayOrder: index }));
}

export function reorderFilteredItems(
  allItems: MenuItem[],
  filteredItems: MenuItem[],
  sourceIndex: number,
  destinationIndex: number,
): MenuItem[] {
  if (sourceIndex === destinationIndex) return allItems;

  const reorderedFiltered = [...filteredItems];
  const [moved] = reorderedFiltered.splice(sourceIndex, 1);
  reorderedFiltered.splice(destinationIndex, 0, moved);

  const filteredIds = new Set(reorderedFiltered.map((item) => item.id));
  const baseOrder = Math.min(...reorderedFiltered.map((item) => item.sortOrder));

  const orderById = new Map<string, number>();
  reorderedFiltered.forEach((item, index) => {
    orderById.set(item.id, baseOrder + index);
  });

  return allItems
    .map((item) =>
      filteredIds.has(item.id)
        ? { ...item, sortOrder: orderById.get(item.id) ?? item.sortOrder }
        : item,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn));
}
