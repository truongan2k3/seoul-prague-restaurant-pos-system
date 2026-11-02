"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { formatCzk } from "@/lib/currency";
import { cachedHistoryAnalytics, expireHistoryAnalyticsCache, historyChangeMatches, historyComparisonDates, subscribeHistoryFinancialChanges, type HistoryAnalytics, type HistoryDates } from "@/lib/history-analytics";
import { getHistoryAnalyticsAction } from "@/src/lib/history-analytics-actions";

const colors = ["#DCC1A5", "#58BBA1", "#9D99C5"];
function Bars({ title, labels, series, money=true }: { title: string; labels: string[]; series: { name: string; values: number[] }[]; money?: boolean }) {
  const [focused,setFocused]=useState<number|null>(null);
  const active=focused!==null&&focused<labels.length?focused:null;
  const maximum=Math.max(1,...series.flatMap(row=>row.values));
  return <section className="min-w-0 rounded-xl border border-white/10 bg-[#141416] p-4">
    <h3 className="text-sm font-medium text-[#E8D5C4]">{title}</h3>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/65">{series.map((row,index)=><span key={row.name} className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full" style={{backgroundColor:colors[index%colors.length]}}/>{row.name}</span>)}</div>
    <div className="mt-4 flex h-28 items-end gap-1 border-b border-white/10" role="group" aria-label={title}>
      {labels.map((label,index)=><button key={`${label}-${index}`} type="button" onFocus={()=>setFocused(index)} onBlur={()=>setFocused(null)} onMouseEnter={()=>setFocused(index)} onMouseLeave={()=>setFocused(null)}
        aria-label={`${label}: ${series.map(row=>`${row.name} ${money?formatCzk(row.values[index]??0):row.values[index]??0}`).join(", ")}`}
        className="flex h-full min-w-0 flex-1 items-end gap-px rounded-t outline-none focus-visible:ring-1 focus-visible:ring-[#C9A88B]">
        {series.map((row,color)=><span key={row.name} className="min-w-0 flex-1 rounded-t-sm transition-[height,opacity] duration-300 motion-reduce:transition-none" style={{height:`${Math.max(0,(row.values[index]??0)/maximum*100)}%`,backgroundColor:colors[color%colors.length],opacity:active===null||active===index?0.9:0.4}}/>)}
      </button>)}
    </div>
    <div className="mt-2 flex justify-between gap-3 text-xs text-white/60"><span>{labels[0]}</span><span>{labels[Math.floor(labels.length/2)]}</span><span>{labels.at(-1)}</span></div>
    <p className="mt-2 min-h-8 text-sm leading-relaxed text-white/60">{active===null?"—":`${labels[active]} · ${series.map(row=>`${row.name}: ${money?formatCzk(row.values[active]??0):row.values[active]??0}`).join(" · ")}`}</p>
  </section>;
}

export function HistoryAnalyticsDashboard({dates,payment,onData}: {
  dates: HistoryDates; payment:string;onData:(data:HistoryAnalytics|null)=>void;
}) {
  const {translate:t,currentStaffUser}=useApp();const {session}=useAuth();
  const key=JSON.stringify([session?.businessId,currentStaffUser?.id,currentStaffUser?.role,dates,payment]);
  const [result,setResult]=useState<{key:string;data:HistoryAnalytics}|null>(null);
  const [showHourly,setShowHourly]=useState(false);
  const [error,setError]=useState<string|null>(null);const [loading,setLoading]=useState(true);const sequence=useRef(0);
  const load=useCallback(async()=>{
    const request=++sequence.current;setLoading(true);setError(null);
    try{
      const data=await cachedHistoryAnalytics(key,dates,async()=>{const response=await getHistoryAnalyticsAction({...dates,payment});if(response.error||!response.data)throw new Error(response.error??"Analytics unavailable");return response.data;});
      if(request!==sequence.current)return;setResult({key,data});onData(data);
    }catch(cause){if(request===sequence.current){setResult(null);setError(cause instanceof Error?cause.message:"Analytics unavailable");onData(null);}}
    finally{if(request===sequence.current)setLoading(false);}
  },[key,dates,payment,onData]);
  useEffect(()=>{expireHistoryAnalyticsCache();},[]);
  useEffect(()=>{onData(null);void load();return()=>{sequence.current++;};},[load,onData]);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const unsubscribe=subscribeHistoryFinancialChanges(event=>{if(!historyComparisonDates(dates).some(range=>historyChangeMatches(event,range)))return;if(timer)clearTimeout(timer);timer=setTimeout(()=>void load(),350);});
    return()=>{unsubscribe();if(timer)clearTimeout(timer);};
  },[dates,load]);
  const data=result?.key===key?result.data:null;const current=data?.periods[0];
  const periods=historyComparisonDates(dates);const oneDay=dates.from===dates.to;
  const previousNames=[t(oneDay?"haYesterday":"haPreviousPeriod"),t(oneDay?"haLastWeek":"haWeekEarlier")];
  const rangeLabel=(range:HistoryDates)=>range.from===range.to?range.from:`${range.from} – ${range.to}`;
  const fields=[{key:"revenue",label:t("haRevenue"),money:true},{key:"tips",label:t("tips"),money:true},{key:"orders",label:t("haOrders"),money:false},{key:"averagePerPerson",label:t("haAverage"),money:true}] as const;
  return <section aria-label={t("haTitle")} className="space-y-4" aria-busy={loading}>
    <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs uppercase tracking-[0.25em] text-[#C9A88B]/70">SEOUL PRAGUE · EUROPE/PRAGUE</p><h2 className="pos-serif mt-1 text-xl text-[#F5F2EF]">{t("haTitle")}</h2></div><span className="text-xs text-white/60">{loading?t("loading"):rangeLabel(dates)}</span></div>
    {error&&<p role="alert" className="rounded-lg border border-amber-400/20 bg-amber-950/20 p-3 text-xs text-amber-200">{error}</p>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{fields.map(field=>{
      const value=current?.[field.key];return <div key={field.key} className="min-w-0 rounded-xl border border-[#C9A88B]/15 bg-gradient-to-br from-[#1B1918] to-[#121214] p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/65">{field.label}</p><p className="mt-2 break-words text-xl font-semibold tabular-nums text-[#E8D5C4] sm:text-2xl">{value==null?"—":field.money?formatCzk(value):value.toLocaleString()}</p>
        <div className="mt-4 space-y-2">{[1,2].map((index)=>{
          const baseline=data?.periods[index]?.[field.key];const delta=value!=null&&baseline!=null?value-baseline:null;
          const percent=delta!==null&&baseline!=null?(baseline===0?(value===0?0:null):delta/Math.abs(baseline)*100):null;
          const positive=delta!==null&&delta>0;
          return <div key={index} title={rangeLabel(periods[index])} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm leading-relaxed"><span className="text-white/70">{previousNames[index-1]}</span>
            <span className={`inline-flex flex-wrap items-center gap-1.5 font-medium tabular-nums ${!delta?"text-white/60":positive?"text-emerald-300":"text-rose-300"}`}>
              {!!delta&&(positive?<TrendingUp className="h-3.5 w-3.5"/>:<TrendingDown className="h-3.5 w-3.5"/>)}{delta===null?"—":`${delta>0?"+":delta<0?"−":""}${field.money?formatCzk(Math.abs(delta)):Math.abs(delta).toLocaleString()}`}
              <span className="opacity-90">({percent===null?"—":`${percent>0?"+":""}${percent.toFixed(1)}%`})</span>
            </span></div>;
        })}</div>
      </div>;
    })}</div>
    <div>
      <button type="button" disabled={!data||!current} aria-expanded={showHourly} aria-controls="history-hourly-chart" onClick={()=>setShowHourly(value=>!value)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#C9A88B]/25 bg-[#141416] px-3 text-sm text-[#DCC1A5] disabled:opacity-40">
        <BarChart3 className="h-4 w-4"/>{t("haHourly")}<ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${showHourly?"rotate-180":""}`}/>
      </button>
      {showHourly&&data&&current&&<div id="history-hourly-chart" className="mt-3">
        <Bars title={t("haHourly")} labels={current.hourly.map(row=>`${String(row.hour).padStart(2,"0")}:00`)} series={data.periods.map((period,index)=>({name:index===0?t("haSelected"):previousNames[index-1],values:period.hourly.map(row=>row.revenue)}))}/>
      </div>}
    </div>
  </section>;
}
