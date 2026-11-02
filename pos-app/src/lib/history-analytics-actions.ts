"use server";

import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { isHistoryDate, type HistoryAnalytics, type HistoryDates } from "@/lib/history-analytics";

export async function getHistoryAnalyticsAction(input: HistoryDates & { payment: string; code?: string; partner?: string; monthComparison?: boolean }): Promise<{ data: HistoryAnalytics | null; error: string | null }> {
  try {
    if (!isHistoryDate(input.from) || !isHistoryDate(input.to) || input.to<input.from || !["all","cash","card"].includes(input.payment) || (input.code?.length ?? 0)>128 || (input.partner?.length ?? 0)>500) throw new Error("Choose valid history filters.");
    const [auth,session]=await Promise.all([readAuthSession(),readStaffSession()]);
    if(!auth || !session || auth.businessId!==session.businessId)throw new Error("Staff login required for sales analytics.");
    const db=createSupabaseAdmin();
    const result=await db.rpc("history_sales_analytics",{p_from:input.from,p_to:input.to,p_actor:session.staffId,p_business:auth.businessId,p_payment:input.payment,p_code:input.code || null,p_partner:input.partner || null,p_month_compare:input.monthComparison===true});
    if(result.error)throw new Error(result.error.message);
    return {data:result.data as HistoryAnalytics,error:null};
  }catch(error){
    const message=error instanceof Error?error.message:"Sales analytics could not be loaded.";
    return {data:null,error:/history_sales_analytics|schema cache/i.test(message)?"Apply supabase/patch-history-analytics.sql in Supabase to enable the analytics dashboard.":message};
  }
}
