import { adjustReferralSalesAction } from "@/src/lib/referral-actions";
import type { OrderItem, PaymentMethod } from "@/lib/types";
import { resolveEqualSplitProgress } from "@/lib/checkout-calculations";
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

/** Preserve the existing void flow; referred payments require a manager-backed server action. */
async function voidSales(scope:{ids?:string[];start?:string;end?:string}) {
  if(scope.ids?.length===0)return {data:[],error:null};
  const ids:string[]=[];
  for(let offset=0;;offset+=500){
    let q=supabase.from("sales").select("id,referral_code_id").is("deleted_at",null).not("referral_code_id","is",null).order("id").range(offset,offset+499);
    if(scope.ids)q=q.in("id",scope.ids);
    if(scope.start)q=q.gte("closed_at",scope.start);
    if(scope.end)q=q.lte("closed_at",scope.end);
    const {data,error}=await q;
    if(error){
      if(error.code==="42703" || (/referral_code_id/i.test(error.message)&&/column|schema cache/i.test(error.message))){
        let legacy=supabase.from("sales").update({deleted_at:new Date().toISOString()}).is("deleted_at",null);
        if(scope.ids)legacy=legacy.in("id",scope.ids);
        if(scope.start)legacy=legacy.gte("closed_at",scope.start);
        if(scope.end)legacy=legacy.lte("closed_at",scope.end);
        return legacy.select("id,deleted_at");
      }
      return {data:null,error};
    }
    ids.push(...(data??[]).filter(r=>r.referral_code_id).map(r=>r.id));
    if((data??[]).length<500)break;
    if(offset>=100000)return {data:null,error:new Error("Choose a narrower date range.")};
  }
  const deletedAt=new Date().toISOString();const referred: {id:string;deleted_at:string}[]=[];
  for(let i=0;i<ids.length;i+=500){
    const result=await adjustReferralSalesAction(ids.slice(i,i+500),{deleted_at:deletedAt},"History payment void / reversal");
    if(result.error)return {data:null,error:new Error(result.error)};
    referred.push(...(result.data??[]));
  }
  let q=supabase.from("sales").update({deleted_at:deletedAt}).is("deleted_at",null).is("referral_code_id",null);
  if(scope.ids)q=q.in("id",scope.ids);
  if(scope.start)q=q.gte("closed_at",scope.start);
  if(scope.end)q=q.lte("closed_at",scope.end);
  const result=await q.select("id,deleted_at");
  return {data:result.error?null:[...(result.data??[]),...referred],error:result.error};
}
export async function deleteSaleRecords(ids:string[]){return voidSales({ids})}
export async function deleteSalesByDate(dateStr:string){const {start,end}=localDayRange(dateStr);return voidSales({start,end})}
export async function deleteSalesByMonth(yearMonth:string){const {start,end}=localMonthRange(yearMonth);return voidSales({start,end})}

export async function updateSaleRecord(
  saleId: string,
  updates: {
    items: OrderItem[];
    subtotal: number;
    discountAmount: number;
    tip: number;
    tipPaymentMethod?: PaymentMethod;
    grandTotal: number;
    paymentMethod: PaymentMethod;
    amountGiven?: number | null;
    changeDue?: number | null;
  },
) {
  const payload: Record<string, unknown> = {
    items: updates.items,
    subtotal: Number(updates.subtotal.toFixed(2)),
    discount_amount: Number(updates.discountAmount.toFixed(2)),
    tip: Number(updates.tip.toFixed(2)),
    tip_payment_method: updates.tipPaymentMethod ?? updates.paymentMethod,
    grand_total: Number(updates.grandTotal.toFixed(2)),
    payment_method: updates.paymentMethod,
  };

  if (updates.paymentMethod === "cash") {
    payload.amount_given =
      updates.amountGiven != null ? Number(updates.amountGiven.toFixed(2)) : null;
    payload.change_due =
      updates.changeDue != null ? Number(updates.changeDue.toFixed(2)) : null;
    payload.card_auth_code = null;
    payload.card_last4 = null;
    payload.card_brand = null;
  } else {
    payload.amount_given = null;
    payload.change_due = null;
    payload.card_auth_code = null;
    payload.card_last4 = null;
    payload.card_brand = null;
  }

  const {data:sale,error:lookupError}=await supabase.from("sales").select("referral_code_id").eq("id",saleId).single();
  if(lookupError){
    if(lookupError.code==="42703" || (/referral_code_id/i.test(lookupError.message)&&/column|schema cache/i.test(lookupError.message)))return supabase.from("sales").update(payload).eq("id",saleId).is("deleted_at",null);
    return {data:null,error:lookupError};
  }
  if(sale?.referral_code_id){
    const result=await adjustReferralSalesAction([saleId],payload,"History payment edit / partial refund");
    return {data:result.data,error:result.error?new Error(result.error):null};
  }
  return supabase.from("sales").update(payload).eq("id", saleId).is("deleted_at", null);
}

/** Count in-progress equal-split payments for a table visit (since occupied). */
export async function fetchEqualSplitProgress(
  tableId: string,
  occupiedAt?: Date | null,
) {
  let query = supabase
    .from("sales")
    .select("id, split_count, closed_at, seated_at")
    .eq("table_id", tableId)
    .eq("split_mode", "equal")
    .is("deleted_at", null)
    .order("closed_at", { ascending: false })
    .limit(30);

  if (occupiedAt) {
    const since = new Date(occupiedAt.getTime() - 60_000);
    query = query.gte("closed_at", since.toISOString());
  }

  const { data, error } = await query;
  if (error) return { paymentsMade: 0, splitCount: 0, error };

  const progress = resolveEqualSplitProgress(
    (data ?? []).map((row) => ({
      splitMode: "equal" as const,
      splitCount: row.split_count,
      closedAt: row.closed_at,
    })),
    occupiedAt,
  );
  return { ...progress, error: null };
}
