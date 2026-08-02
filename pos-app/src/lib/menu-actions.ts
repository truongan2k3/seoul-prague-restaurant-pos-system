import type { MenuItem } from "@/lib/types";
import { DEFAULT_MENU_CATEGORY, type MenuCategory } from "@/lib/menu-categories";
import { deriveItemType, resolveStation } from "@/lib/order-routing";
import { supabase } from "@/src/lib/supabase";

export type MenuItemInput = {
  nameEn: string;
  nameCz: string;
  nameZh: string;
  descriptionEn?: string;
  descriptionCz?: string;
  descriptionZh?: string;
  category: MenuCategory | string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  sortOrder?: number;
  station?: MenuItem["station"];
  itemType?: MenuItem["itemType"];
};

function deriveRouting(category: string) {
  const itemType = deriveItemType(category);
  return { station: resolveStation(category, itemType), itemType };
}

function toDbRow(input: MenuItemInput) {
  const routing = deriveRouting(input.category);
  return {
    name_en: input.nameEn.trim(),
    name_cz: input.nameCz.trim() || null,
    name_zh: input.nameZh.trim() || null,
    description_en: input.descriptionEn?.trim() || null,
    description_cz: input.descriptionCz?.trim() || null,
    description_zh: input.descriptionZh?.trim() || null,
    name: input.nameEn.trim(),
    category: input.category,
    price: input.price,
    station: input.station ?? routing.station,
    item_type: input.itemType ?? routing.itemType,
    is_available: input.isAvailable,
    sold_out: !input.isAvailable,
    sort_order: input.sortOrder ?? 0,
    image_url: input.imageUrl?.trim() || null,
    description: input.descriptionEn?.trim() || null,
  };
}

export async function createMenuItem(input: MenuItemInput) {
  return supabase.from("menu_items").insert(toDbRow(input)).select("*").single();
}

export async function updateMenuItem(id: string, input: MenuItemInput) {
  return supabase.from("menu_items").update(toDbRow(input)).eq("id", id).select("*").single();
}

export async function updateMenuItemAvailability(id: string, isAvailable: boolean) {
  return supabase
    .from("menu_items")
    .update({ is_available: isAvailable, sold_out: !isAvailable })
    .eq("id", id);
}

export async function deleteMenuItem(id: string) {
  return supabase.from("menu_items").delete().eq("id", id);
}

export async function updateMenuSortOrders(items: { id: string; sortOrder: number }[]) {
  const results = await Promise.all(
    items.map(({ id, sortOrder }) =>
      supabase.from("menu_items").update({ sort_order: sortOrder }).eq("id", id),
    ),
  );
  const error = results.find((r) => r.error)?.error ?? null;
  return { error };
}

export const emptyMenuItemInput: MenuItemInput = {
  nameEn: "",
  nameCz: "",
  nameZh: "",
  descriptionEn: "",
  descriptionCz: "",
  descriptionZh: "",
  category: DEFAULT_MENU_CATEGORY,
  price: 0,
  imageUrl: "",
  isAvailable: true,
};
