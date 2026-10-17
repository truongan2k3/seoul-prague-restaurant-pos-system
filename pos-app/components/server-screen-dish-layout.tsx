"use client";

import { useMemo, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { formatPreparationMinutes, preparationAgeMinutes, preparationHighlightTone } from "@/lib/server-screen";
import { DISH_SELECTION_MS, type DishEntry, type DishSelection } from "@/lib/dish-preparation";
import type { LanguageCode } from "@/lib/types";

type TableEntry = {key:string;entries:DishEntry[];selection?:DishSelection;external:boolean};

function SelectionCountdown({deadline}:{deadline:number}) {
  const style=useMemo(()=>({"--dish-countdown-delay":`${-Math.max(0,Date.now()-(deadline-DISH_SELECTION_MS))}ms`}) as CSSProperties,[deadline]);
  return <span aria-hidden className="dish-selection-countdown absolute inset-x-0 bottom-0 h-0.5 origin-left bg-zinc-950/45" style={style}/>;
}

export function ServerScreenDishLayout({entries,selections,externalSelected,nowMs,language,minLabel,emptyLabel,error,onSelect,processing=false}:{
  entries:DishEntry[];selections:Map<string,DishSelection>;externalSelected:Set<string>;
  nowMs:number;language:LanguageCode;minLabel:string;emptyLabel:string;error:string|null;
  onSelect:(ids:string[])=>void;processing?:boolean;
}) {
  const reduceMotion=useReducedMotion();
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

  return <div className="px-3 py-1 sm:px-4">
    {error&&<p role="alert" className="mb-3 rounded-xl border border-amber-400/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">{error}</p>}
    {!dishes.length?<p className="py-10 text-center text-base text-white/35">{emptyLabel}</p>:<div className="divide-y divide-white/10">
      {dishes.map(dish=><section key={dish.key} className="py-2 sm:py-2.5">
        <div className="grid grid-cols-[minmax(110px,0.85fr)_minmax(0,2fr)] items-center gap-2 md:grid-cols-[minmax(170px,0.8fr)_minmax(0,2.5fr)] md:gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 className="break-words text-base font-semibold leading-snug text-[#F5EDE4] sm:text-lg lg:text-xl">{dish.name}</h2>
              <span aria-label={`${dish.outstanding} outstanding`} aria-live="polite" aria-atomic="true" className={`whitespace-nowrap text-lg font-bold tabular-nums sm:text-xl ${dish.outstanding>0?"text-[#DCC1A5]":"text-emerald-400/65"}`}>{dish.outstanding}×</span>
            </div>
            {dish.nameZh&&<p className="mt-0.5 text-xs text-white/50">{dish.nameZh}</p>}
          </div>
          <div className="flex min-w-0 flex-wrap items-start justify-end gap-y-1">
            {Array.from(dish.tables.values()).sort((a,b)=>a.entries[0].orderedAt.localeCompare(b.entries[0].orderedAt)||a.entries[0].id.localeCompare(b.entries[0].id)).map((table,index)=>{
              const entry=table.entries[0];
              const done=Boolean(entry.completedAt);
              const selected=Boolean(table.selection)||table.external;
              const quantity=table.entries.reduce((sum,row)=>sum+row.quantity,0);
              const tone=preparationHighlightTone(preparationAgeMinutes(entry.orderedAt,nowMs));
              const clock=entry.orderedAt?new Date(entry.orderedAt):null;
              const orderTime=clock&&Number.isFinite(clock.getTime())?clock.toLocaleTimeString(language==="cs"?"cs-CZ":language==="zh"?"zh-CN":"en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}):"—";
              return <motion.div key={JSON.stringify(table.entries.map(row=>row.id).sort())}
                layout={reduceMotion?false:"position"}
                initial={reduceMotion?false:{opacity:0,x:24}}
                animate={{opacity:1,x:0}}
                transition={{layout:{duration:reduceMotion?0:0.3,ease:"easeOut"},opacity:{duration:reduceMotion?0:0.18},x:{duration:reduceMotion?0:0.3}}}
                className="flex max-w-full items-center">
                {index>0&&<ArrowRight aria-hidden="true" strokeWidth={2.5} className="mx-1 h-6 w-6 shrink-0 text-[#DCC1A5]/90 sm:h-7 sm:w-7"/>}
                <button type="button" data-server-interactive
                disabled={done||Boolean(table.selection?.saving)||(table.external&&processing)} aria-pressed={selected}
                aria-label={`${entry.tableLabel}, ${quantity} ${dish.name}, ordered ${orderTime}${done?", completed":table.selection?.saving?", completing":selected?", selected, tap to deselect":""}`}
                title={`${entry.tableLabel} · ${orderTime}${entry.note?` · ${entry.note}`:""}`}
                onClick={()=>onSelect(table.entries.map(row=>row.id))}
                className={`relative min-h-[78px] min-w-[72px] max-w-[220px] overflow-hidden rounded-lg border px-2 py-1 text-center transition-colors motion-reduce:transition-none ${done?"border-emerald-500/25 bg-emerald-950/35 text-emerald-200/80":selected?"border-amber-300 bg-amber-300/90 text-zinc-950":tone==="critical"?"border-red-500/50 bg-red-950/25 text-white":tone==="warn"?"border-orange-400/40 bg-orange-950/20 text-white":"border-transparent bg-transparent text-[#F5EDE4] hover:border-[#C9A88B]/60 hover:bg-[#C9A88B]/10"}`}>
                <div className="flex h-3.5 items-center justify-center gap-1.5">
                  <span className={`text-[11px] font-semibold leading-none tabular-nums ${done?"line-through decoration-emerald-300/40":""}`}>{quantity}×</span>
                  {done?<Check className="h-4 w-4" aria-hidden/>:table.selection?.saving?<Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden/>:null}
                </div>
                <p className="mt-0.5 break-words font-sans text-[1.85rem] font-bold leading-none tracking-wide tabular-nums sm:text-[2rem]">{entry.tableLabel}</p>
                <p className={`mt-1 text-[11px] leading-none tabular-nums ${selected?"text-zinc-800/80":"text-current/65"}`}>{done?"✓ Done":formatPreparationMinutes(entry.orderedAt,nowMs,minLabel)}</p>
                <time dateTime={entry.orderedAt||undefined} className={`mt-1 block text-[9px] leading-none tabular-nums ${selected?"text-zinc-800/65":"text-current/45"}`}>{orderTime}</time>
                {entry.note&&<p className="mt-1.5 max-w-[200px] whitespace-pre-wrap break-words border-t border-current/15 pt-1 text-left text-xs leading-snug">{entry.note}</p>}
                {table.selection&&!table.selection.saving&&<SelectionCountdown deadline={table.selection.deadline}/>}
                </button>
              </motion.div>;
            })}
          </div>
        </div>
      </section>)}
    </div>}
  </div>;
}
