"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, ChevronDown, TrendingDown, TrendingUp, X } from "lucide-react";
import { ModalOverlay, ModalPanel } from "@/components/modal-overlay";
import { HistoryLineChart, type HistoryLineSeries } from "@/components/history-line-chart";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { formatCzk } from "@/lib/currency";
import { formatInVenueTz, todayIsoDateInVenue } from "@/lib/venue-timezone";
import { cachedHistoryAnalytics, expireHistoryAnalyticsCache, historyChangeMatches, historyComparisonPeriods, isHistoryCalendarMonth, subscribeHistoryFinancialChanges, type HistoryAnalytics, type HistoryDates } from "@/lib/history-analytics";
import { historyItemBreakdown } from "@/lib/history-item-breakdown";
import type { MenuItem, SaleRecord } from "@/lib/types";
import { getHistoryAnalyticsAction } from "@/src/lib/history-analytics-actions";

export function HistoryAnalyticsDashboard({dates,payment,monthComparison=false,sales,menuItems,onData}: {
  dates: HistoryDates; payment:string;monthComparison?:boolean;sales:SaleRecord[];menuItems:MenuItem[];onData:(data:HistoryAnalytics|null)=>void;
}) {
  const {translate:t,currentStaffUser,language}=useApp();const {session}=useAuth();
  const monthly=monthComparison||isHistoryCalendarMonth(dates);
  const key=JSON.stringify([session?.businessId,currentStaffUser?.id,currentStaffUser?.role,dates,payment,monthly]);
  const [result,setResult]=useState<{key:string;data:HistoryAnalytics}|null>(null);
  const [showHourly,setShowHourly]=useState(false);
  const [expandedCategory,setExpandedCategory]=useState<"food"|"drinks"|null>(null);
  const [graphMetric,setGraphMetric]=useState<"revenue"|"tips"|"orders"|"average"|null>(null);
  const [error,setError]=useState<string|null>(null);const [loading,setLoading]=useState(true);const sequence=useRef(0);
  const load=useCallback(async()=>{
    const request=++sequence.current;setLoading(true);setError(null);
    try{
      const data=await cachedHistoryAnalytics(key,dates,async()=>{const response=await getHistoryAnalyticsAction({...dates,payment,monthComparison:monthly});if(response.error||!response.data)throw new Error(response.error??"Analytics unavailable");return response.data;},monthly);
      if(request!==sequence.current)return;setResult({key,data});onData(data);
    }catch(cause){if(request===sequence.current){setResult(null);setError(cause instanceof Error?cause.message:"Analytics unavailable");onData(null);}}
    finally{if(request===sequence.current)setLoading(false);}
  },[key,dates,payment,monthly,onData]);
  useEffect(()=>{expireHistoryAnalyticsCache();},[]);
  useEffect(()=>{onData(null);void load();return()=>{sequence.current++;};},[load,onData]);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const unsubscribe=subscribeHistoryFinancialChanges(event=>{if(!historyComparisonPeriods(dates,monthly).some(range=>historyChangeMatches(event,range)))return;if(timer)clearTimeout(timer);timer=setTimeout(()=>void load(),350);});
    return()=>{unsubscribe();if(timer)clearTimeout(timer);};
  },[dates,monthly,load]);
  const data=result?.key===key?result.data:null;const current=data?.periods[0];
  const periods=historyComparisonPeriods(dates,monthly);const oneDay=dates.from===dates.to;
  const comparisonIndices=monthly?[1]:oneDay&&dates.from===todayIsoDateInVenue()?[1,2]:[2];
  const previousNames=[t(monthly?"haLastMonth":oneDay?"haYesterday":"haPreviousPeriod"),t(oneDay?"haLastWeek":"haWeekEarlier")];
  const rangeLabel=(range:HistoryDates)=>range.from===range.to?range.from:`${range.from} – ${range.to}`;
  const fields=[{key:"revenue",label:t("haRevenue"),money:true},{key:"tips",label:t("tips"),money:true},{key:"orders",label:t("haOrders"),money:false},{key:"average",label:t("haAverage"),money:true}] as const;
  const revenueBreakdown=[{key:"food",label:t("haFoodRevenue")},{key:"drinks",label:t("haDrinksRevenue")}] as const;
  const itemDetails=useMemo(()=>expandedCategory?historyItemBreakdown(sales,expandedCategory,menuItems,language):[],[sales,expandedCategory,menuItems,language]);
  const graph=fields.find(field=>field.key===graphMetric);
  const graphIndices=[0,...comparisonIndices];
  const seriesForMetric=(metric: "revenue"|"tips"|"orders"|"average", hourly=false): HistoryLineSeries[] => {
    if(!data)return [];
    const locale=language==="cs"?"cs-CZ":language==="vi"?"vi-VN":"en-GB";
    return graphIndices.map(index=>{
      const period=data.periods[index];
      const points=hourly?period.hourly.map(point=>({label:`${String(point.hour).padStart(2,"0")}:00`,value:point[metric]??null}))
        :(period.timeline??(index===0?data.daily:[])).map(point=>({label:formatInVenueTz(`${point.date}T12:00:00Z`,locale,{day:"numeric",month:"short"}),value:point[metric]??null}));
      return {name:index===0?t("haSelected"):previousNames[index-1],points};
    });
  };
  return <section aria-label={t("haTitle")} className="space-y-4" aria-busy={loading}>
    <div className="flex flex-wrap items-end justify-between gap-2"><h2 className="pos-serif text-xl text-[#F5F2EF]">{t("haTitle")}</h2><span className="text-xs text-white/60">{loading?t("loading"):rangeLabel(dates)}</span></div>
    {error&&<p role="alert" className="rounded-lg border border-amber-400/20 bg-amber-950/20 p-3 text-xs text-amber-200">{error}</p>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{fields.map(field=>{
      const value=current?.[field.key];return <button key={field.key} type="button" disabled={!data} aria-haspopup="dialog" onClick={()=>setGraphMetric(field.key)} className="min-w-0 rounded-xl border border-[#C9A88B]/15 bg-gradient-to-br from-[#1B1918] to-[#121214] p-4 text-left transition-colors hover:border-[#C9A88B]/50 focus-visible:outline focus-visible:outline-[#C9A88B] disabled:cursor-wait motion-reduce:transition-none">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/65">{field.label}</p><p className="mt-2 break-words text-xl font-semibold tabular-nums text-[#E8D5C4] sm:text-2xl">{value==null?"—":field.money?formatCzk(value):value.toLocaleString()}</p>
        <div className="mt-4 space-y-2">{comparisonIndices.map((index)=>{
          const baseline=data?.periods[index]?.[field.key];const delta=value!=null&&baseline!=null?value-baseline:null;
          const percent=delta!==null&&baseline!=null?(baseline===0?(value===0?0:null):delta/Math.abs(baseline)*100):null;
          const positive=delta!==null&&delta>0;
          return <div key={index} title={rangeLabel(periods[index])} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm leading-relaxed"><span className="text-white/70">{previousNames[index-1]}</span>
            <span className={`inline-flex flex-wrap items-center gap-1.5 font-medium tabular-nums ${!delta?"text-white/60":positive?"text-emerald-300":"text-rose-300"}`}>
              {!!delta&&(positive?<TrendingUp className="h-3.5 w-3.5"/>:<TrendingDown className="h-3.5 w-3.5"/>)}{delta===null?"—":`${delta>0?"+":delta<0?"−":""}${field.money?formatCzk(Math.abs(delta)):Math.abs(delta).toLocaleString()}`}
              <span className="opacity-90">({percent===null?"—":`${percent>0?"+":""}${percent.toFixed(1)}%`})</span>
            </span></div>;
        })}</div>
      </button>;
    })}</div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {revenueBreakdown.map(field=><button key={field.key} type="button" disabled={loading} aria-expanded={expandedCategory===field.key} aria-controls="history-item-details" onClick={()=>setExpandedCategory(value=>value===field.key?null:field.key)} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-[#141416] px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-[#C9A88B] motion-reduce:transition-none ${expandedCategory===field.key?"border-[#C9A88B]/60":"border-[#C9A88B]/15 hover:border-[#C9A88B]/40"}`}>
        <p className="text-sm text-white/70">{field.label}</p><span className="inline-flex items-center gap-3"><span className="text-lg font-semibold tabular-nums text-[#E8D5C4]">{data?formatCzk(data.breakdown[field.key]):"—"}</span><ChevronDown className={`h-4 w-4 text-[#C9A88B] transition-transform motion-reduce:transition-none ${expandedCategory===field.key?"rotate-180":""}`}/></span>
      </button>)}
    </div>
    {expandedCategory&&<div id="history-item-details" className="max-h-80 overflow-auto rounded-xl border border-white/10 bg-[#141416] p-4">
      <table className="w-full text-left text-sm"><thead className="text-xs text-white/60"><tr><th className="pb-3 font-medium">{t("summaryExcelItemName")}</th><th className="pb-3 pl-3 text-right font-medium">{t("summaryExcelQuantity")}</th><th className="pb-3 pl-3 text-right font-medium">{t("revenue")}</th></tr></thead><tbody>
        {itemDetails.map(row=><tr key={row.key} className="border-t border-white/5"><td className="py-3 text-white/85">{row.name}</td><td className="py-3 pl-3 text-right tabular-nums text-white/65">{row.quantity.toLocaleString(undefined,{maximumFractionDigits:4})}×</td><td className="whitespace-nowrap py-3 pl-3 text-right tabular-nums text-[#E8D5C4]">{formatCzk(row.revenue)}</td></tr>)}
      </tbody></table>{!itemDetails.length&&<p className="py-4 text-sm text-white/50">{t("summaryNoSales")}</p>}
    </div>}
    <div>
      <button type="button" disabled={!data||!current} aria-expanded={showHourly} aria-controls="history-hourly-chart" onClick={()=>setShowHourly(value=>!value)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#C9A88B]/25 bg-[#141416] px-3 text-sm text-[#DCC1A5] disabled:opacity-40">
        <BarChart3 className="h-4 w-4"/>{t("haHourly")}<ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${showHourly?"rotate-180":""}`}/>
      </button>
      {showHourly&&data&&current&&<div id="history-hourly-chart" className="mt-3">
        <HistoryLineChart title={t("haHourly")} series={seriesForMetric("revenue",true)}/>
      </div>}
    </div>
    <ModalOverlay open={graphMetric!==null} onClose={()=>setGraphMetric(null)} ariaLabelledBy="history-metric-title" className="flex items-center justify-center p-4">
      <ModalPanel className="max-h-[90dvh] w-full max-w-4xl overflow-auto rounded-2xl border border-[#C9A88B]/25 bg-[#101012] p-4 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3"><h3 id="history-metric-title" className="pos-serif text-xl text-[#E8D5C4]">{graph?.label}</h3><button type="button" aria-label={t("close")} onClick={()=>setGraphMetric(null)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 text-white/70"><X className="h-5 w-5"/></button></div>
        {graph&&data&&<>
          <HistoryLineChart title={graph.label} money={graph.money} series={seriesForMetric(graph.key,oneDay&&!monthly)}/>
          <div className={`mt-4 grid gap-3 ${graphIndices.length===2?"sm:grid-cols-2":"sm:grid-cols-3"}`}>{graphIndices.map(index=><div key={index} className="rounded-lg bg-white/5 p-3"><p className="text-xs text-white/65">{index===0?t("haSelected"):previousNames[index-1]}</p><p className="mt-1 text-lg font-semibold tabular-nums text-[#E8D5C4]">{graph.money?formatCzk(data.periods[index][graph.key]):data.periods[index][graph.key].toLocaleString()}</p><p className="mt-1 text-xs text-white/50">{rangeLabel(periods[index])}</p></div>)}</div>
        </>}
      </ModalPanel>
    </ModalOverlay>
  </section>;
}
