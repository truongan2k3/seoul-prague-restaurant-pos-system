import { supabase } from "@/src/lib/supabase";

export type CategoryType = "dish" | "drink";

export type CategoryInput = {
  name: string;
  type: CategoryType;
  displayOrder?: number;
};

function toDbRow(input: CategoryInput) {
  return {
    name: input.name.trim(),
    type: input.type,
    display_order: input.displayOrder ?? 0,
  };
}

export async function createCategory(input: CategoryInput) {
  return supabase.from("categories").insert(toDbRow(input)).select("*").single();
}

export async function updateCategory(id: string, input: CategoryInput) {
  const name = input.name.trim();
  const result = await supabase
    .from("categories")
    .update(toDbRow(input))
    .eq("id", id)
    .select("*")
    .single();

  if (!result.error) {
    await supabase.from("menu_items").update({ category: name }).eq("category_id", id);
  }

  return result;
}

export async function deleteCategory(id: string) {
  return supabase.from("categories").delete().eq("id", id);
}

export async function countItemsInCategory(categoryId: string) {
  const { count, error } = await supabase
    .from("menu_items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);
  return { count: count ?? 0, error };
}

export async function updateCategoryDisplayOrders(
  items: { id: string; displayOrder: number }[],
) {
  const results = await Promise.all(
    items.map(({ id, displayOrder }) =>
      supabase.from("categories").update({ display_order: displayOrder }).eq("id", id),
    ),
  );
  const error = results.find((r) => r.error)?.error ?? null;
  return { error };
}

export async function checkCategoriesSchema() {
  const { error } = await supabase.from("categories").select("id").limit(1);
  if (!error) return { ok: true as const, error: null };

  const message =
    error.code === "42P01" || error.message.includes("categories")
      ? "Categories table missing. Run supabase/patch-categories.sql in Supabase SQL Editor."
      : error.message;

  return { ok: false as const, error: message };
}
