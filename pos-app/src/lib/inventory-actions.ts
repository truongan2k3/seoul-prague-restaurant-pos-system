import type { InventoryItem } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

export type InventoryInput = {
  name: string;
  category: InventoryItem["category"];
  quantity: number;
  unit: string;
  soldOut?: boolean;
};

function toDbRow(input: InventoryInput) {
  return {
    name: input.name.trim(),
    category: input.category,
    quantity: input.quantity,
    unit: input.unit.trim() || "pcs",
    sold_out: input.soldOut ?? false,
  };
}

export async function createInventoryItem(input: InventoryInput) {
  return supabase.from("inventory_items").insert(toDbRow(input)).select("*").single();
}

export async function updateInventoryItem(id: string, input: InventoryInput) {
  return supabase
    .from("inventory_items")
    .update(toDbRow(input))
    .eq("id", id)
    .select("*")
    .single();
}

export async function deleteInventoryItem(id: string) {
  return supabase.from("inventory_items").delete().eq("id", id);
}
