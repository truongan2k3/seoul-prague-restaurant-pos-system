"use client";

import { useMemo, type CSSProperties } from "react";
import { Check, Loader2 } from "lucide-react";
import { formatPreparationMinutes, preparationAgeMinutes, preparationHighlightTone } from "@/lib/server-screen";
import { DISH_SELECTION_MS, type DishEntry, type DishSelection } from "@/lib/dish-preparation";
import type { LanguageCode } from "@/lib/types";

type TableEntry = {key:string;entries:DishEntry[];selection?:DishSelection;external:boolean};

function SelectionCountdown({deadline}:{deadline:number}) {
  const style=useMemo(()=>({"--dish-countdown-delay":`${-Math.max(0,Date.now()-(deadline-DISH_SELECTION_MS))}ms`}) as CSSProperties,[deadline]);
  return <span aria-hidden className="dish-selection-countdown absolute inset-x-0 bottom-0 h-0.5 origin-left bg-zinc-950/45" style={style}/>;
}

export function ServerScreenDishLayout({entries,selections,externalSelected,nowMs,language,minLabel,emptyLabel,error,onSelect}:{
  entries:DishEntry[];selections:Map<string,DishSelection>;externalSelected:Set<string>;
  nowMs:number;language:LanguageCode;minLabel:string;emptyLabel:string;error:string|null;
  onSelect:(ids:string[])=>void;
}) {
  const dishes=useMemo(()=>{
    const grouped=new Map<string,{name:string;nameZh:string|null;outstanding:number;first:string;tables:Map<string,TableEntry>}>();
    for(const entry of entries){
      let dish=grouped.get(entry.dishKey);
      if(!dish){dish={name:entry.name,nameZh:entry.nameZh,outstanding:0,first:entry.orderedAt,tables:new Map()};grouped.set(entry.dishKey,dish);}
      if(!entry.completedAt)dish.outstanding+=entry.quantity;
      if(entry.orderedAt<dish.first)dish.first=entry.orderedAt;
      const selection=selections.get(entry.id);
      const external=externalSelected.has(entry.id);
      // Same table's different sends, notes, timers and completion times remain separate.
      const key=JSON.stringify([entry.tableId,entry.orderedAt,entry.note,entry.completedAt??null,selection?.deadline??null,selection?.saving??false,external]);
      const table=dish.tables.get(key);
      if(table)table.entries.push(entry);
      else dish.tables.set(key,{key,entries:[entry],selection,external});
    }
    return Array.from(grouped,([key,dish])=>({key,...dish})).sort((a,b)=>a.first.localeCompare(b.first)||a.key.localeCompare(b.key));
  },[entries,selections,externalSelected]);

  return <div className="p-3 sm:p-4">
    {error&&<p role="alert" className="mb-3 rounded-xl border border-amber-400/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">{error}</p>}
    {!dishes.length?<p className="py-10 text-center text-base text-white/35">{emptyLabel}</p>:<div className="space-y-3">
      {dishes.map(dish=><section key={dish.key} className="rounded-2xl border border-white/10 bg-[#141416] p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(150px,0.8fr)_minmax(0,2fr)] sm:gap-5">
          <div className="min-w-0 sm:pt-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="break-words text-xl font-semibold leading-tight text-[#F5EDE4] sm:text-2xl">{dish.name}</h2>
              <span aria-label={`${dish.outstanding} outstanding`} aria-live="polite" aria-atomic="true" className={`whitespace-nowrap text-2xl font-bold tabular-nums ${dish.outstanding>0?"text-[#DCC1A5]":"text-emerald-400/65"}`}>{dish.outstanding}×</span>
            </div>
            {dish.nameZh&&<p className="mt-1 text-sm text-white/50">{dish.nameZh}</p>}
          </div>
          <div className="flex min-w-0 flex-wrap items-start gap-2.5">
            {Array.from(dish.tables.values()).sort((a,b)=>a.entries[0].orderedAt.localeCompare(b.entries[0].orderedAt)||a.entries[0].id.localeCompare(b.entries[0].id)).map(table=>{
              const entry=table.entries[0];
              const done=Boolean(entry.completedAt);
              const selected=Boolean(table.selection)||table.external;
              const quantity=table.entries.reduce((sum,row)=>sum+row.quantity,0);
              const tone=preparationHighlightTone(preparationAgeMinutes(entry.orderedAt,nowMs));
              const clock=entry.orderedAt?new Date(entry.orderedAt):null;
              const orderTime=clock&&Number.isFinite(clock.getTime())?clock.toLocaleTimeString(language==="cs"?"cs-CZ":language==="zh"?"zh-CN":"en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}):"—";
              return <button key={JSON.stringify([table.key,...table.entries.map(row=>row.id).sort()])} type="button" data-server-interactive
                disabled={done||selected} aria-pressed={selected}
                aria-label={`${entry.tableLabel}, ${quantity} ${dish.name}, ordered ${orderTime}${done?", completed":selected?", selected":""}`}
                title={`${entry.tableLabel} · ${orderTime}${entry.note?` · ${entry.note}`:""}`}
                onClick={()=>onSelect(table.entries.map(row=>row.id))}
                className={`relative min-h-[98px] min-w-[108px] max-w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-colors motion-reduce:transition-none ${done?"border-emerald-500/25 bg-emerald-950/35 text-emerald-200/80":selected?"border-amber-300 bg-amber-300/90 text-zinc-950":tone==="critical"?"border-red-500/50 bg-red-950/25 text-white":tone==="warn"?"border-orange-400/40 bg-orange-950/20 text-white":"border-white/15 bg-white/[0.035] text-[#F5EDE4] hover:border-[#C9A88B]/60 hover:bg-[#C9A88B]/10"}`}>
                <div className="flex items-center justify-between gap-4">
                  <span className={`text-sm font-bold tabular-nums ${done?"line-through decoration-emerald-300/40":""}`}>{quantity}×</span>
                  {done?<Check className="h-4 w-4" aria-hidden/>:table.selection?.saving?<Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden/>:null}
                </div>
                <p className="mt-0.5 break-words font-serif text-[1.7rem] font-semibold leading-tight">{entry.tableLabel}</p>
                <p className={`mt-1 text-xs tabular-nums ${selected?"text-zinc-800/80":"text-current/65"}`}>{done?"✓ Done":formatPreparationMinutes(entry.orderedAt,nowMs,minLabel)}</p>
                <time dateTime={entry.orderedAt||undefined} className={`mt-0.5 block text-[10px] tabular-nums ${selected?"text-zinc-800/65":"text-current/45"}`}>{orderTime}</time>
                {entry.note&&<p className="mt-2 max-w-[240px] whitespace-pre-wrap break-words border-t border-current/15 pt-1.5 text-xs leading-relaxed">{entry.note}</p>}
                {table.selection&&!table.selection.saving&&<SelectionCountdown deadline={table.selection.deadline}/>}
              </button>;
            })}
          </div>
        </div>
      </section>)}
    </div>}
  </div>;
}
