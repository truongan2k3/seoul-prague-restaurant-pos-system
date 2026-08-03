import type { OrderItem } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

function localDayRange(dateStr: string): { start: string; end: string } {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59.999`);
  return { start: start.toISOString(), end: end.toISOString() };
}

function localMonthRange(yearMonth: string): { start: string; end: string } {
  const [year, month] = yearMonth.split("-").map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function deleteSaleRecords(ids: string[]) {
  if (ids.length === 0) {
    return { data: [] as { id: string }[], error: null };
  }
  return supabase.from("sales").delete().in("id", ids).select("id");
}

export async function deleteSalesByDate(dateStr: string) {
  const { start, end } = localDayRange(dateStr);
  return supabase.from("sales").delete().gte("closed_at", start).lte("closed_at", end).select("id");
}

export async function deleteSalesByMonth(yearMonth: string) {
  const { start, end } = localMonthRange(yearMonth);
  return supabase.from("sales").delete().gte("closed_at", start).lte("closed_at", end).select("id");
}

export async function updateSaleRecord(
  saleId: string,
  updates: {
    items: OrderItem[];
    subtotal: number;
    discountAmount: number;
    tip: number;
    grandTotal: number;
  },
) {
  return supabase
    .from("sales")
    .update({
      items: updates.items,
      subtotal: Number(updates.subtotal.toFixed(2)),
      discount_amount: Number(updates.discountAmount.toFixed(2)),
      tip: Number(updates.tip.toFixed(2)),
      grand_total: Number(updates.grandTotal.toFixed(2)),
    })
    .eq("id", saleId);
}
