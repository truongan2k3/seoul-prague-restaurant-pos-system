"use client";

import { useId, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useApp } from "@/contexts/app-context";
import { formatCzk } from "@/lib/currency";

export type HistoryLineSeries = { name: string; points: { label: string; value: number | null }[] };
const COLORS=["#E4C6A6","#62BFAE","#AAA2DB"];
const WIDTH=1000, HEIGHT=250, TOP=16, BOTTOM=HEIGHT-16;

function curve(points: {x:number;y:number}[]) {
  return points.map((point,index)=>{
    if(index===0)return `M ${point.x} ${point.y}`;
    const previous=points[index-1],middle=(previous.x+point.x)/2;
    return `C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }).join(" ");
}

export function HistoryLineChart({title,series,money=true}: {title:string;series:HistoryLineSeries[];money?:boolean}) {
  const {translate:t,language}=useApp();
  const gradient=`history-line-${useId().replace(/:/g,"")}`;
  const [focused,setFocused]=useState<number|null>(null);
  const count=Math.max(1,...series.map(row=>row.points.length));
  const latest=Math.max(0,(series[0]?.points.length??1)-1);
  const active=Math.min(count-1,Math.max(0,focused??latest));
  const x=(index:number)=>count===1?WIDTH/2:12+index/(count-1)*(WIDTH-24);
  const locale=language==="cs"?"cs-CZ":language==="vi"?"vi-VN":"en-GB";
  const compact=useMemo(()=>new Intl.NumberFormat(locale,{notation:"compact",maximumFractionDigits:1}),[locale]);
  const valueLabel=(value:number|null|undefined)=>value==null?"—":money?formatCzk(value):value.toLocaleString(locale);
  const geometry=useMemo(()=>{
    const values=series.flatMap(row=>row.points.map(point=>point.value).filter((value):value is number=>value!==null&&Number.isFinite(value)));
    const maximum=Math.max(1,...values);
    const raw=maximum*1.08/4,power=10**Math.floor(Math.log10(raw));
    const step=Math.max(money?0.01:1,([1,1.5,2,2.5,4,5,7.5,10].find(value=>value*power>=raw)??10)*power);
    const ceiling=step*4;
    const plotted=series.map(row=>{
      const segments:Array<Array<{x:number;y:number}>>=[];
      let segment:Array<{x:number;y:number}>=[];
      row.points.forEach((point,index)=>{
        if(point.value===null||!Number.isFinite(point.value)){if(segment.length)segments.push(segment);segment=[];return;}
        segment.push({x:count===1?WIDTH/2:12+index/(count-1)*(WIDTH-24),y:BOTTOM-point.value/ceiling*(BOTTOM-TOP)});
      });
      if(segment.length)segments.push(segment);
      return {paths:segments.map(segment=>({line:curve(segment),area:`${curve(segment)} L ${segment[segment.length-1].x} ${BOTTOM} L ${segment[0].x} ${BOTTOM} Z`,single:segment.length===1?segment[0]:null}))};
    });
    return {ceiling,ticks:[4,3,2,1,0].map(index=>index*step),plotted,available:values.length>0};
  },[series,count,money]);
  const axis=[...new Set([0,Math.floor((count-1)/4),Math.floor((count-1)/2),Math.floor((count-1)*3/4),count-1])];
  const labels=series[0]?.points??[];
  const move=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const bounds=event.currentTarget.getBoundingClientRect();
    const position=(event.clientX-bounds.left)/Math.max(1,bounds.width);
    setFocused(Math.max(0,Math.min(count-1,Math.round((position*WIDTH-12)/(WIDTH-24)*(count-1)))));
  };
  return <section aria-label={title} className="overflow-hidden rounded-xl border border-[#C9A88B]/15 bg-gradient-to-b from-[#19191C] to-[#101012] p-4 sm:p-5">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-x-5 gap-y-2">{series.map((row,index)=><span key={`${row.name}-${index}`} className="inline-flex items-center gap-2 text-xs text-white/75"><i className="h-2 w-2 rounded-full" style={{backgroundColor:COLORS[index%COLORS.length]}}/>{row.name}</span>)}</div>
      {money&&<span className="rounded-md border border-white/10 px-2 py-1 text-xs tracking-wider text-white/45">CZK</span>}
    </div>
    {!geometry.available?<p className="py-16 text-center text-sm text-white/55">{t("haTimelineUnavailable")}</p>:<>
      <div className="flex gap-2 sm:gap-3">
        <div aria-hidden="true" className="relative h-[250px] w-11 shrink-0 text-right text-xs tabular-nums text-white/45 sm:w-14">{geometry.ticks.map((tick,index)=><span key={index} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{top:TOP+index*(BOTTOM-TOP)/4}}>{compact.format(tick)}</span>)}</div>
        <div className="relative min-w-0 flex-1">
          <div role="group" aria-label={title} aria-describedby={`${gradient}-values`} tabIndex={0} className="relative h-[250px] touch-pan-y rounded-md outline-none focus-visible:ring-1 focus-visible:ring-[#C9A88B]/60" onPointerMove={move} onPointerDown={move} onPointerLeave={event=>{if(event.pointerType==="mouse")setFocused(null);}} onKeyDown={event=>{
            const next=event.key==="ArrowLeft"?active-1:event.key==="ArrowRight"?active+1:event.key==="Home"?0:event.key==="End"?count-1:null;
            if(next===null)return;event.preventDefault();setFocused(Math.max(0,Math.min(count-1,next)));
          }}>
            <svg aria-hidden="true" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={COLORS[0]} stopOpacity="0.2"/><stop offset="100%" stopColor={COLORS[0]} stopOpacity="0"/></linearGradient></defs>
              {geometry.ticks.map((_,index)=><line key={index} x1="0" x2={WIDTH} y1={TOP+index*(BOTTOM-TOP)/4} y2={TOP+index*(BOTTOM-TOP)/4} stroke="#FFFFFF" strokeOpacity={index===4?0.14:0.06} strokeDasharray={index===4?undefined:"3 5"} vectorEffect="non-scaling-stroke"/>)}
              <g className="history-lines">{geometry.plotted.map((row,index)=><g key={index}>{row.paths.map((path,segment)=><g key={segment}>
                {index===0&&<path d={path.area} fill={`url(#${gradient})`}/>}
                <path d={path.line} fill="none" stroke={COLORS[index%COLORS.length]} strokeWidth={index===0?2.75:1.8} strokeDasharray={index===0?undefined:"5 5"} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
              </g>)}</g>)}</g>
              <line x1={x(active)} x2={x(active)} y1={TOP} y2={BOTTOM} stroke={COLORS[0]} strokeOpacity="0.3" strokeDasharray="3 5" vectorEffect="non-scaling-stroke"/>
            </svg>
            {geometry.plotted.map((row,index)=>row.paths.filter(path=>path.single).map((path,segment)=><i key={`${index}-${segment}`} aria-hidden="true" className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{left:`${path.single!.x/WIDTH*100}%`,top:`${path.single!.y/HEIGHT*100}%`,backgroundColor:COLORS[index%COLORS.length]}}/>))}
            {series.map((row,index)=>{const value=row.points[active]?.value;if(value==null)return null;return <i key={index} aria-hidden="true" className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#171719]" style={{left:`${x(active)/WIDTH*100}%`,top:`${(BOTTOM-value/geometry.ceiling*(BOTTOM-TOP))/HEIGHT*100}%`,backgroundColor:COLORS[index%COLORS.length],boxShadow:`0 0 0 4px ${COLORS[index%COLORS.length]}22`}}/>;})}
          </div>
          <div aria-hidden="true" className="relative mt-3 h-8 text-xs tabular-nums text-white/50">{axis.map((index,position)=><span key={index} className={`absolute whitespace-nowrap ${axis.length===1?"-translate-x-1/2":position===0?"":position===axis.length-1?"-translate-x-full":"-translate-x-1/2"}`} style={{left:`${x(index)/WIDTH*100}%`}}>{labels[index]?.label??String(index+1)}</span>)}</div>
        </div>
      </div>
      <div id={`${gradient}-values`} className={`mt-3 grid gap-2 border-t border-white/10 pt-4 ${series.length===2?"sm:grid-cols-2":"sm:grid-cols-3"}`}>{series.map((row,index)=><div key={index} className="min-w-0 rounded-lg bg-white/[0.025] px-3 py-2.5"><p className="truncate text-xs text-white/55">{row.name} · {row.points[active]?.label??"—"}</p><p className="mt-1 text-sm font-semibold tabular-nums" style={{color:COLORS[index%COLORS.length]}}>{valueLabel(row.points[active]?.value)}</p></div>)}</div>
    </>}
    <style jsx>{`
      .history-lines { animation: historyLineReveal 400ms ease-out; }
      @keyframes historyLineReveal { from { opacity: 0; } to { opacity: 1; } }
      @media (prefers-reduced-motion: reduce) { .history-lines { animation: none; } }
    `}</style>
  </section>;
}
