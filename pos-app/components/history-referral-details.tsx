"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { getHistoryAnalyticsAction } from "@/src/lib/history-analytics-actions";
import { todayIsoDateInVenue } from "@/lib/venue-timezone";
import { cachedHistoryAnalytics, historyChangeMatches, subscribeHistoryFinancialChanges } from "@/lib/history-analytics";
import { useApp } from "@/contexts/app-context";
import { formatCzk } from "@/lib/currency";
import { saleReferral, type HistoryAttribution } from "@/lib/history-analytics";
import type { SaleRecord } from "@/lib/types";

export function HistoryReferralDetails({sale,attribution,compact=false,commissionAllowed=false}: {sale:SaleRecord;attribution?:HistoryAttribution;compact?:boolean;commissionAllowed?:boolean}) {
  const {translate:t,currentStaffUser}=useApp();const {session}=useAuth();
  const canCommission=commissionAllowed&&["admin","manager","cashier"].includes(currentStaffUser?.role??"");
  const [loaded,setLoaded]=useState<{id:string;scope:string;data:HistoryAttribution}|null>(null);
  const scope=`${session?.businessId}:${currentStaffUser?.id}:${currentStaffUser?.role}`;
  useEffect(()=>{
    if(compact||!canCommission||attribution)return;
    let cancelled=false;
    const date=todayIsoDateInVenue(sale.closedAt);const dates={from:date,to:date};
    const key=JSON.stringify([session?.businessId,currentStaffUser?.id,currentStaffUser?.role,dates,"all","",""]);
    const load=()=>void cachedHistoryAnalytics(key,dates,async()=>{
      const result=await getHistoryAnalyticsAction({...dates,payment:"all"});if(result.error||!result.data)throw new Error(result.error??"Analytics unavailable");return result.data;
    }).then(data=>{if(!cancelled&&data.attributions[sale.id])setLoaded({id:sale.id,scope,data:data.attributions[sale.id]});}).catch(()=>{});
    load();const unsubscribe=subscribeHistoryFinancialChanges(event=>{if(event.saleId===sale.id||historyChangeMatches(event,dates))load();});
    return()=>{cancelled=true;unsubscribe();};
  },[compact,canCommission,attribution,sale.id,sale.closedAt,scope,session?.businessId,currentStaffUser?.id,currentStaffUser?.role]);
  const referral=saleReferral(sale,attribution??(loaded?.id===sale.id&&loaded.scope===scope?loaded.data:undefined));
  if(!referral.codeId&&!referral.code)return null;
  return <div className={compact?"mt-2 max-w-[240px] rounded-md border border-[#C9A88B]/20 bg-[#C9A88B]/5 px-2 py-1.5":"rounded-xl border border-[#C9A88B]/25 bg-[#C9A88B]/5 p-4"}>
    <p className="text-xs font-semibold text-[#E8D5C4]">{referral.code??t("haUnrecorded")}{referral.partner?` · ${referral.partner}`:""}</p>
    <p className="mt-1 text-[10px] text-white/50">{t("haCustomerDiscount")}: {referral.discountPercent}% · −{formatCzk(referral.discountAmount)}</p>
    {!compact&&canCommission&&<p className="mt-2 text-xs text-[#DCC1A5]">{t("haCommission")}: {referral.commission===null?"—":formatCzk(referral.commission)}</p>}
  </div>;
}
