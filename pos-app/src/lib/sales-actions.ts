import type { OrderItem } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

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
