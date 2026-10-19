"use server";

import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { supabase } from "@/src/lib/supabase";
import { normalizeReferralCode, referralAvailable, buildReferralCheckoutTotals, type ReferralCode, type ReferralDashboardData, type ReferralPayment, type ReferralQuote } from "@/lib/referrals";
import type { CheckoutLine } from "@/lib/checkout-calculations";
import { inferServiceChannel } from "@/lib/tax-summary";

function adminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Referral setup requires SUPABASE_SERVICE_ROLE_KEY in server environment settings.");
  return createSupabaseAdmin();
}
async function actor(manager = false) {
  if (!process.env.AUTH_SECRET) throw new Error("Configure AUTH_SECRET before using secure referral management.");
  const [auth, session] = await Promise.all([readAuthSession(), readStaffSession()]);
  if (!auth || !session || auth.businessId !== session.businessId) throw new Error("Staff login required.");
  const db = adminClient();
  const { data, error } = await db.from("staff").select("id,name,role,business_id,active").eq("id",session.staffId).eq("business_id",auth.businessId).eq("active",true).single();
  if (error || !data || !["admin","cashier","manager",...(manager ? [] : ["server"])].includes(data.role)) throw new Error("You do not have permission for this referral action.");
  return { db, staff: data, businessId: auth.businessId };
}
async function notifyChange(db: ReturnType<typeof adminClient>) {
  const channel=db.channel("referral_management");
  try { await channel.send({type:"broadcast",event:"CHANGED",payload:{}}); } catch { /* Refresh remains available on reconnect. */ }
  finally { await db.removeChannel(channel); }
}
function message(error: unknown) { return error instanceof Error ? error.message : "Referral operation failed."; }
function migrationError(value: string) { return /does not exist|schema cache/i.test(value) ? "Apply supabase/patch-referrals.sql before using referrals." : value; }

export async function validateReferralCodeAction(code: string): Promise<{valid:boolean; code?:string; discountPercent?:number; minSpend?:number; message:string}> {
  const normalized = normalizeReferralCode(String(code));
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(normalized)) return {valid:false,message:"Enter a valid referral code."};
  const {data,error}=await supabase.rpc("validate_referral_code",{p_code:normalized});
  if(error)return {valid:false,message:migrationError(error.message)};
  return data;
}

export async function getReferralQuoteAction(tableId: string): Promise<{data:ReferralQuote|null;error:string|null}> {
  return loadReferralQuote(tableId);
}

async function loadReferralQuote(tableId: string, context?: Awaited<ReturnType<typeof actor>>): Promise<{data:ReferralQuote|null;error:string|null}> {
  try {
    // Ordinary checkouts keep working without any referral service-role operation.
    const {data:reservation,error}=await (context?.db ?? supabase).from("reservations").select("id,referral_code_id,checked_in_at")
      .eq("status","checked_in").or(`table_id.eq.${tableId},secondary_table_id.eq.${tableId},tertiary_table_id.eq.${tableId}`)
      .order("checked_in_at",{ascending:false}).limit(1).maybeSingle();
    if(error){
      if(error.code==="42703" || (/referral_code_id/i.test(error.message)&&/column|schema cache/i.test(error.message)))return {data:null,error:null};
      throw new Error(migrationError(error.message));
    }
    if(!reservation?.referral_code_id)return {data:null,error:null};
    const {db,businessId}=context ?? await actor();
    const {data:a,error:ae}=await db.from("referral_attributions").select("*").eq("reservation_id",reservation.id).eq("business_id",businessId).single();
    if(ae||!a)throw new Error("Referral attribution is unavailable for this business.");
    const [{data:c,error:ce},{data:redemption}]=await Promise.all([
      db.from("referral_codes").select("*").eq("id",a.code_id).single(),
      db.from("referral_redemptions").select("visit_subtotal").eq("reservation_id",reservation.id).maybeSingle(),
    ]);
    if(ce||!c)throw new Error("Referral code is unavailable.");
    const {data:tableVisit}=await db.from("tables").select("occupied_at").eq("id",tableId).single();
    let visitStart=tableVisit?.occupied_at;
    if(!visitStart){const {data:firstItem}=await db.from("order_items").select("created_at").eq("table_id",tableId).order("created_at").limit(1).maybeSingle();visitStart=firstItem?.created_at??reservation.checked_in_at; }
    let history=db.from("sales").select("referral_installment").eq("table_id",tableId).not("referral_installment","is",null).order("referral_installment",{ascending:false}).limit(1);
    history=visitStart?history.eq("seated_at",visitStart):history.is("seated_at",null);
    const {data:priorPayments,error:historyError}=await history;
    if(historyError)throw new Error(historyError.message);
    return {data:{lastInstallment:Number(priorPayments?.[0]?.referral_installment??0),codeId:c.id,code:a.rules.code,partner:a.rules.partner_name,discountPercent:Number(a.rules.discount_percent),minSpend:Number(a.rules.min_spend),active:c.active,
      expiresAt:c.expires_at,remainingUses:c.usage_limit==null?null:Math.max(0,c.usage_limit-c.usage_count),redeemed:!!redemption,visitSubtotal:Number(redemption?.visit_subtotal??0),version:c.updated_at,reservationId:reservation.id},error:null};
  } catch(e){return {data:null,error:message(e)}}
}

/** Public reservation creation calls this only for a nonempty code; DB trigger validates again atomically. */
export async function requireValidReferralForBooking(code: string) {
  const result=await validateReferralCodeAction(code);
  if(!result.valid)throw new Error(result.message);
  return result.code!;
}

async function readAll(db: ReturnType<typeof adminClient>, table: string, businessId: string, dateColumn?: string, from?: string, to?: string) {
  const rows: Record<string,unknown>[]=[];
  for(let offset=0;offset<100000;){
    let query=db.from(table).select("*",{count:"exact"}).eq("business_id",businessId).order("id").range(offset,offset+999);
    if(dateColumn&&from&&to)query=query.gte(dateColumn,from).lt(dateColumn,to);
    const {data,error,count}=await query;if(error)throw new Error(migrationError(error.message));
    rows.push(...(data??[]));offset+=(data??[]).length;
    if(!(data??[]).length||(count!==null&&offset>=count)||(count===null&&(data??[]).length<1000))return rows;
  }
  throw new Error("Too many records. Choose a narrower date range before exporting.");
}
export async function getReferralDashboardAction(from: string,to: string): Promise<{data:ReferralDashboardData|null;error:string|null}> {
  try {
    const start=new Date(from),end=new Date(to);
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error("Choose a valid date range.");
    const {db,businessId}=await actor(true);
    const [codes,ledger,payouts,reservations,audit,balances]=await Promise.all([
      readAll(db,"referral_codes",businessId),readAll(db,"referral_commissions",businessId,"created_at",start.toISOString(),end.toISOString()),
      readAll(db,"referral_payouts",businessId,"paid_at",start.toISOString(),end.toISOString()),readAll(db,"referral_reservation_history",businessId,"reserved_at",start.toISOString(),end.toISOString()),
      readAll(db,"referral_audit",businessId,"created_at",start.toISOString(),end.toISOString()),
      db.from("referral_balances").select("*").eq("business_id",businessId),
    ]);
    if(balances.error)throw new Error(balances.error.message);
    return {data:{codes,ledger,payouts,reservations,audit,balances:balances.data??[]} as unknown as ReferralDashboardData,error:null};
  }catch(e){return {data:null,error:message(e)}}
}
export async function saveReferralCodeAction(input: Partial<ReferralCode>) {
  try {
    const {db,businessId,staff}=await actor(true);
    const values={id:input.id??null,code:normalizeReferralCode(String(input.code??"")),partner_name:String(input.partner_name??"").trim(),partner_contact:String(input.partner_contact??"").trim().slice(0,500),
      active:input.active===true,discount_percent:Number(input.discount_percent),commission_percent:Number(input.commission_percent),min_spend:Number(input.min_spend),
      expires_at:input.expires_at||null,usage_limit:input.usage_limit??null,deduct_vouchers:false,deduct_other_discounts:false,
      exclude_tax:false,tax_rates:{A:21,B:12}};
    if(!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(values.code)||!values.partner_name)throw new Error("Code and partner name are required.");
    for(const n of [values.discount_percent,values.commission_percent])if(!Number.isFinite(n)||n<0||n>100)throw new Error("Percentages must be between 0 and 100.");
    if(!Number.isFinite(values.min_spend)||values.min_spend<0)throw new Error("Minimum spend must be nonnegative.");
    if(values.usage_limit!==null&&(!Number.isInteger(values.usage_limit)||values.usage_limit<1))throw new Error("Usage limit must be a positive integer.");
    if(values.expires_at&&!Number.isFinite(new Date(values.expires_at).getTime()))throw new Error("Invalid expiration date.");
    const payload={...values,business_id:businessId,updated_by:staff.id,updated_by_name:staff.name,updated_at:new Date().toISOString()};
    const {id:codeId,...fields}=payload;
    const result=codeId
      ? await db.from("referral_codes").update(fields).eq("id",codeId).eq("business_id",businessId).eq("updated_at",input.updated_at).select("id").single()
      : await db.from("referral_codes").insert(fields).select("id").single();
    if(!result.error)await notifyChange(db);
    return {id:result.data?.id as string|null,error:result.error?.message??null};
  }catch(e){return {id:null,error:message(e)}}
}
export async function payReferralCommissionAction(input:{codeId:string;amount:number;paidAt:string;notes:string;requestKey:string}) {
  try{
    const {db,businessId,staff}=await actor(true);
    if(!Number.isFinite(input.amount)||input.amount<=0||!Number.isFinite(new Date(input.paidAt).getTime()))throw new Error("Enter a valid positive payout amount and date.");
    const {data:prior}=await db.from("referral_payouts").select("id,code_id,amount").eq("request_key",input.requestKey).eq("business_id",businessId).maybeSingle();
    if(prior){if(prior.code_id!==input.codeId||Number(prior.amount)!==input.amount)throw new Error("Payout key conflict.");return {id:prior.id as string,error:null};}
    const {data,error}=await db.from("referral_payouts").insert({business_id:businessId,code_id:input.codeId,amount:input.amount,paid_at:input.paidAt,notes:input.notes.slice(0,2000),request_key:input.requestKey,actor_id:staff.id,actor_name:staff.name}).select("id").single();
    if(error){
      const {data:existing}=await db.from("referral_payouts").select("id,code_id,amount").eq("request_key",input.requestKey).eq("business_id",businessId).maybeSingle();
      if(existing&&existing.code_id===input.codeId&&Number(existing.amount)===input.amount)return {id:existing.id as string,error:null};
    }
    if(!error)await notifyChange(db);
    return {id:data?.id as string|null,error:error?.message??null};
  }catch(e){return {id:null,error:message(e)}}
}
export async function changeReservationReferralAction(reservationId:string,code:string,reason:string){
  try{
    const {db,businessId,staff}=await actor(true);
    if(reason.trim().length<3)throw new Error("Enter an authorization reason.");
    const {data:attribution}=await db.from("referral_attributions").select("business_id").eq("reservation_id",reservationId).single();
    if(attribution?.business_id!==businessId)throw new Error("Reservation access denied.");
    if(code.trim()){
      const {data:target}=await db.from("referral_codes").select("id").eq("code",normalizeReferralCode(code)).eq("business_id",businessId).single();
      if(!target)throw new Error("Referral code not found for this business.");
    }
    const {error}=await db.from("reservations").update({referral_code:normalizeReferralCode(code)||null,referral_override_reason:reason.trim(),referral_changed_by:staff.id,updated_at:new Date().toISOString()}).eq("id",reservationId);
    if(!error)await notifyChange(db);
    return {error:error?.message??null};
  }catch(e){return {error:message(e)}}
}

export async function commitReferralSaleAction(sale:Record<string,unknown>,referral:ReferralPayment|undefined) {
  try{
    const context=await actor();
    const {db,businessId,staff}=context;
    if (referral?.paymentKey) {
      const {data:existing}=await db.from("sales").select("id,table_id,seated_at,referral_snapshot").eq("referral_payment_key",referral.paymentKey).maybeSingle();
      if(existing){
        if(existing.table_id!==sale.table_id||existing.referral_snapshot?.business_id!==businessId)throw new Error("Payment key conflict.");
        const {data:currentTable,error:te}=await db.from("tables").select("occupied_at,status").eq("id",existing.table_id).single();
        if(te)throw new Error(te.message);
        return {id:existing.id as string,error:null,skipSettlement:currentTable.status==="empty"||currentTable.occupied_at!==existing.seated_at};
      }
    }
    const quoteResult=await loadReferralQuote(String(sale.table_id),context);
    const quote=quoteResult.data;if(quoteResult.error||!quote)throw new Error(quoteResult.error??"Reservation referral changed. Reopen checkout.");
    if(!referral||referral.codeId!==quote.codeId||referral.version!==quote.version)throw new Error("Refresh checkout before applying this referral.");
    const {data:allTableLines,error:le}=await db.from("order_items").select("id,name,price,quantity,menu_item_id,kitchen_status,status,is_cancelled").eq("table_id",String(sale.table_id));
    if(le)throw new Error(le.message);
    const tableLines=(allTableLines??[]).filter(row=>!row.is_cancelled&&!["cancelled","archived"].includes(row.kitchen_status??row.status));
    const menuIds=[...new Set((tableLines??[]).map(row=>row.menu_item_id).filter(Boolean))];
    const {data:menuRows,error:menuError}=menuIds.length?await db.from("menu_items").select("id,tax_group,item_type").in("id",menuIds):{data:[],error:null};
    if(menuError)throw new Error(menuError.message);
    const visitSubtotal=(tableLines??[]).reduce((sum,row)=>sum+Number(row.price)*Number(row.quantity),0);
    const available=referralAvailable(quote,visitSubtotal);
    const expectedPercent=available?quote.discountPercent:0;
    const percent=Number(referral.discountPercent);
    if(!Number.isFinite(percent)||percent<0||percent>100)throw new Error("Invalid referral discount.");
    if(percent!==expectedPercent){if(!["admin","cashier","manager"].includes(staff.role)||!referral.overrideReason?.trim())throw new Error("A manager and override reason are required to change the referral discount.");}
    const items=sale.items as Array<{id?:string;name:string;price:number;quantity:number;taxGroup?:string}>;
    if(!Array.isArray(items)||!items.length)throw new Error("No payable items.");
    const divisor=sale.split_mode==="equal"?Number(sale.split_count):1;
    if(!Number.isInteger(divisor)||divisor<1||divisor>20)throw new Error("Invalid split count.");
    const usedQuantities=new Map<string,number>();
    for(const item of items){
      if(!Number.isFinite(item.price)||item.price<0||!Number.isFinite(item.quantity)||item.quantity<=0)throw new Error("Invalid order amounts.");
      const stored=(tableLines??[]).find(row=>(item.id?row.id===item.id:row.name===item.name)&&Number((Number(row.price)/divisor).toFixed(2))===item.price);
      if(!stored||item.quantity>Number(stored.quantity)+0.00001)throw new Error("Order changed. Refresh checkout before paying.");
      const used=stored?(usedQuantities.get(stored.id)??0)+item.quantity:0;
      if(!stored||used>Number(stored.quantity)+0.00001)throw new Error("Duplicate order quantities.");
      usedQuantities.set(stored.id,used);
      item.id=stored.id;
      const menu=menuRows?.find(m=>m.id===stored.menu_item_id);
      item.taxGroup=menu?.tax_group==="A"||(!menu?.tax_group&&menu?.item_type==="drink")?"A":"B";
    }
    const subtotal=items.reduce((sum,item)=>sum+item.price*item.quantity,0);
    if(Math.abs(subtotal-Number(sale.subtotal))>1)throw new Error("Payment subtotal does not match the order.");
    const {data:settings}=await db.from("settings").select("enable_price_rounding").eq("business_id",businessId).maybeSingle();
    const rounded=settings?.enable_price_rounding!==false;
    const manualValue=Number(sale.discount_value??0)/(sale.split_mode==="equal"&&sale.referral_equal_scope==="bill"&&sale.discount_type==="fixed"?divisor:1);
    const totals=buildReferralCheckoutTotals({lines:items as CheckoutLine[],discountType:sale.discount_type==="fixed"?"fixed":"percent",discountValue:manualValue,tip:Number(sale.tip??0),splitMode:"total",splitCount:1,enablePriceRounding:rounded,referralPercent:percent});
    if(Math.abs(totals.discountAmount-Number(sale.discount_amount))>(rounded?1:0.02))throw new Error("Discount total changed. Refresh checkout.");
    let voucher=0;
    if(Array.isArray(sale.voucher_codes)&&sale.voucher_codes.length){const {data:vouchers,error:ve}=await db.from("voucher_codes").select("code,denomination_czk,status,applied_table_id").in("code",sale.voucher_codes);if(ve)throw new Error(ve.message);if(vouchers?.length!==new Set(sale.voucher_codes).size||vouchers.some(v=>v.status!=="applied"||v.applied_table_id!==sale.table_id))throw new Error("Voucher changed. Refresh checkout.");voucher=Math.min(totals.afterDiscount,vouchers.reduce((sum,v)=>sum+Number(v.denomination_czk),0));}
    if(Math.abs(voucher-Number(sale.voucher_discount_amount??0))>0.02||Math.abs(Math.max(0,totals.grandTotal-voucher)-Number(sale.grand_total))>(rounded?1:0.02))throw new Error("Payable total changed. Refresh checkout.");
    const payload:Record<string,unknown>={...sale,items,reservation_id:quote.reservationId,referral_payment_key:referral.paymentKey,referral_installment:referral.installment,referral_code_id:quote.codeId,
      referral_discount_percent:percent,referral_discount_amount:totals.referralDiscountAmount,referral_override_reason:referral.overrideReason??null,
      referral_visit_subtotal:Math.max(visitSubtotal,quote.visitSubtotal),service_channel:inferServiceChannel(String(sale.table_label))};
    delete payload.referral_equal_scope;
    payload.staff_id=staff.id;payload.staff_name=staff.name;
    payload.referral_code_version=quote.version;payload.referral_actor_id=staff.id;payload.referral_actor_name=staff.name;
    const {data,error}=await db.from("sales").insert(payload).select("id").single();
    if(error){
      const {data:existing}=await db.from("sales").select("id").eq("referral_payment_key",referral.paymentKey).eq("referral_snapshot->>business_id",businessId).maybeSingle();
      if(existing)return {id:existing.id as string,error:null};
    }
    return {id:data?.id as string|null,error:error?.message??null};
  }catch(e){return {id:null,error:message(e)}}
}

/** Only referred sale edits use this path; the existing History UI still drives refunds/voids. */
export async function adjustReferralSalesAction(ids:string[],updates:Record<string,unknown>,reason:string){
  try{
    const {db,businessId,staff}=await actor(true);
    if(!ids.length||ids.length>5000||!reason.trim())throw new Error("Select payments and enter an adjustment reason.");
    const allowed=["items","subtotal","discount_amount","tip","tip_payment_method","grand_total","payment_method","amount_given","change_due","card_auth_code","card_last4","card_brand","deleted_at"];
    if(Object.keys(updates).some(key=>!allowed.includes(key)))throw new Error("Unsupported payment adjustment.");
    for(const key of ["subtotal","discount_amount","tip","grand_total"])if(key in updates&&(!Number.isFinite(updates[key])||Number(updates[key])<0))throw new Error("Invalid payment amounts.");
    const {data:rows,error:re}=await db.from("sales").select("id,referral_snapshot").in("id",ids);
    if(re||rows?.length!==ids.length||rows.some(row=>row.referral_snapshot?.business_id!==businessId))throw new Error("Payment access denied.");
    const {data,error}=await db.from("sales").update({...updates,referral_actor_id:staff.id,referral_actor_name:staff.name,referral_adjustment_reason:reason}).in("id",ids).select("id,deleted_at");
    if(error)throw new Error(error.message);
    return {data,error:null};
  }catch(e){return {data:null,error:message(e)}}
}

export async function getReferralOrderAction(saleId:string){
  try{
    const {db,businessId}=await actor(true);
    const {data,error}=await db.from("sales").select("id,table_label,guest_name,reservation_id,items,subtotal,discount_amount,referral_discount_amount,tip,voucher_discount_amount,grand_total,payment_method,closed_at,deleted_at,referral_snapshot")
      .eq("id",saleId).eq("referral_snapshot->>business_id",businessId).single();
    if(error)throw new Error(error.message);return {data,error:null};
  }catch(e){return {data:null,error:message(e)}}
}
