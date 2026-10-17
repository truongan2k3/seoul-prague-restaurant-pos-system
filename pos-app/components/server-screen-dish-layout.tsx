"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Loader2, Minus, Plus, TriangleAlert } from "lucide-react";
import { formatPreparationMinutes, preparationAgeMinutes, preparationHighlightTone } from "@/lib/server-screen";
import { DISH_SELECTION_MS, type DishEntry, type DishSelection } from "@/lib/dish-preparation";
import type { LanguageCode } from "@/lib/types";

type TableEntry = {key:string;entries:DishEntry[];selection?:DishSelection;external:boolean};

function SelectionCountdown({deadline}:{deadline:number}) {
  const style=useMemo(()=>({"--dish-countdown-delay":`${-Math.max(0,Date.now()-(deadline-DISH_SELECTION_MS))}ms`}) as CSSProperties,[deadline]);
  return <span aria-hidden className="dish-selection-countdown absolute inset-x-0 bottom-0 h-0.5 origin-left bg-zinc-950/45" style={style}/>;
}

function useDishColumns(hasDishes: boolean) {
  const listRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState({split:false, height:0});

  useLayoutEffect(() => {
    const list = listRef.current;
    const viewport = list?.closest<HTMLElement>("[data-server-scroll]");
    if (!list || !viewport) return;
    const landscape = window.matchMedia("(orientation: landscape) and (min-width: 640px)");
    let frame = 0;
    const measure = () => {
      frame = 0;
      const offset = list.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
      const height = Math.max(0, Math.floor(viewport.clientHeight - offset - 4));
      let naturalHeight = list.offsetHeight;
      if (landscape.matches && list.dataset.split === "true") {
        // Measure at full width so the narrower columns cannot cause a split/merge loop.
        const probe = list.cloneNode(true) as HTMLDivElement;
        probe.dataset.split = "false";
        probe.setAttribute("aria-hidden", "true");
        probe.inert = true;
        Object.assign(probe.style, {
          position:"absolute", top:"0", left:"0", visibility:"hidden",
          pointerEvents:"none", width:`${list.getBoundingClientRect().width}px`,
        });
        list.parentElement?.appendChild(probe);
        naturalHeight = probe.offsetHeight;
        probe.remove();
      }
      const split = landscape.matches && height > 0 && naturalHeight > height + 2;
      setColumns(previous => previous.split === split && previous.height === height ? previous : {split, height});
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(viewport);
    resize.observe(list);
    const observeRows = () => {
      resize.disconnect();
      resize.observe(viewport);
      resize.observe(list);
      Array.from(list.children).forEach(row => resize.observe(row));
      schedule();
    };
    const changes = new MutationObserver(observeRows);
    changes.observe(list, {childList:true, subtree:true});
    landscape.addEventListener("change", schedule);
    measure();
    observeRows();
    return () => {
      resize.disconnect();
      changes.disconnect();
      landscape.removeEventListener("change", schedule);
      cancelAnimationFrame(frame);
    };
  }, [hasDishes]);

  return {listRef, ...columns};
}

export function ServerScreenDishLayout({entries,selections,externalSelected,nowMs,language,minLabel,emptyLabel,error,onSelect,processing=false}:{
  entries:DishEntry[];selections:Map<string,DishSelection>;externalSelected:Set<string>;
  nowMs:number;language:LanguageCode;minLabel:string;emptyLabel:string;error:string|null;
  onSelect:(ids:string[])=>void;processing?:boolean;
}) {
  const reduceMotion=useReducedMotion();
  const [quantityChoice,setQuantityChoice]=useState<{key:string;count:number}|null>(null);
  const quantityLabels=language==="cs"
    ? {choose:"Vybrat počet",less:"Snížit počet",more:"Zvýšit počet",confirm:"Potvrdit výběr",cancel:"Zrušit výběr"}
    : language==="zh"
      ? {choose:"选择数量",less:"减少数量",more:"增加数量",confirm:"确认选择",cancel:"取消选择"}
      : {choose:"Choose quantity",less:"Decrease quantity",more:"Increase quantity",confirm:"Confirm selection",cancel:"Cancel selection"};
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

  const columns=useDishColumns(dishes.length>0);

  return <div className="px-3 py-1 sm:px-4">
    {error&&<p role="alert" className="mb-3 rounded-xl border border-amber-400/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">{error}</p>}
    {!dishes.length?<p className="py-10 text-center text-base text-white/35">{emptyLabel}</p>:<div className="dish-layout-frame" style={{minHeight:columns.split?columns.height:undefined}}>
      <motion.div aria-hidden="true" className="dish-layout-divider" initial={false}
        animate={{opacity:columns.split?1:0,scaleY:columns.split?1:0}}
        transition={{duration:reduceMotion?0:0.45,ease:[0.22,1,0.36,1]}}/>
      <div ref={columns.listRef} data-split={columns.split} className="dish-layout-columns divide-y divide-white/10">
      {dishes.map(dish=><motion.section key={dish.key} className="dish-layout-section py-2 sm:py-2.5"
        layout={reduceMotion?false:"position"} layoutDependency={columns.split} initial={false}
        transition={{layout:{duration:reduceMotion?0:0.5,ease:[0.22,1,0.36,1]}}}>
        <div className="dish-layout-row grid grid-cols-[minmax(110px,0.85fr)_minmax(0,2fr)] items-center gap-2 md:grid-cols-[minmax(170px,0.8fr)_minmax(0,2.5fr)] md:gap-4">
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
              const entryIds=table.entries.map(row=>row.id).sort();
              const entryKey=JSON.stringify(entryIds);
              const canChooseQuantity=!done&&!selected&&table.entries.length>1;
              const choosing=canChooseQuantity&&quantityChoice?.key===entryKey;
              const chosenCount=choosing?Math.min(quantityChoice?.count??1,entryIds.length):1;
              const locked=done||Boolean(table.selection?.saving)||(table.external&&processing);
              const tone=preparationHighlightTone(preparationAgeMinutes(entry.orderedAt,nowMs));
              const waitTime=formatPreparationMinutes(entry.orderedAt,nowMs,minLabel);
              return <motion.div key={entryKey}
                layout={reduceMotion?false:"position"}
                initial={reduceMotion?false:{opacity:0,x:24}}
                animate={{opacity:1,x:0}}
                transition={{layout:{duration:reduceMotion?0:0.3,ease:"easeOut"},opacity:{duration:reduceMotion?0:0.18},x:{duration:reduceMotion?0:0.3}}}
                className="flex max-w-full items-center">
                {index>0&&<ArrowRight aria-hidden="true" strokeWidth={2.5} className="mx-1 h-6 w-6 shrink-0 text-[#DCC1A5]/90 sm:h-7 sm:w-7"/>}
                <div className="flex min-w-0 max-w-[220px] flex-col">
                <button type="button" data-server-interactive
                disabled={locked} aria-pressed={selected}
                aria-expanded={canChooseQuantity?choosing:undefined}
                aria-label={`${entry.tableLabel}, ${quantity} ${dish.name}, waiting ${waitTime}${canChooseQuantity?`, ${choosing?quantityLabels.cancel:quantityLabels.choose}`:""}${done?", completed":table.selection?.saving?", completing":selected?", selected, tap to deselect":tone==="critical"?", overdue":tone==="warn"?", long wait":""}`}
                title={`${entry.tableLabel} · ${waitTime}${entry.note?` · ${entry.note}`:""}`}
                onClick={()=>{
                  if(canChooseQuantity){setQuantityChoice(choosing?null:{key:entryKey,count:1});return;}
                  setQuantityChoice(null);
                  onSelect(entryIds);
                }}
                className={`relative min-h-[78px] min-w-[72px] max-w-[220px] overflow-hidden rounded-lg border px-2 py-1 text-center transition-colors motion-reduce:transition-none ${done?"border-emerald-500/25 bg-emerald-950/35 text-emerald-200/80":selected?"border-amber-300 bg-amber-300/90 text-zinc-950":tone==="critical"?"border-red-400 bg-[#86272E] text-red-50 shadow-[0_0_14px_rgba(248,113,113,0.2)]":tone==="warn"?"border-orange-400 bg-[#8A3B12] text-orange-50 shadow-[0_0_10px_rgba(251,146,60,0.12)]":"border-transparent bg-transparent text-[#F5EDE4] hover:border-[#C9A88B]/60 hover:bg-[#C9A88B]/10"}`}>
                <div className="flex h-3.5 items-center justify-center gap-1.5">
                  <span className={`text-[11px] font-semibold leading-none tabular-nums ${done?"line-through decoration-emerald-300/40":""}`}>{quantity}×</span>
                  {done?<Check className="h-4 w-4" aria-hidden/>:table.selection?.saving?<Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden/>:!selected&&tone!=="normal"?<TriangleAlert className="h-3.5 w-3.5" aria-hidden/>:null}
                </div>
                <p className="mt-0.5 break-words font-sans text-[1.85rem] font-bold leading-none tracking-wide tabular-nums sm:text-[2rem]">{entry.tableLabel}</p>
                <p className={`mt-1.5 text-sm font-semibold leading-none tabular-nums ${selected?"text-zinc-800/80":!done&&tone!=="normal"?"font-bold text-white":"text-current/65"}`}>{done?"✓ Done":waitTime}</p>
                {entry.note&&<p className="mt-1.5 max-w-[200px] whitespace-pre-wrap break-words border-t border-current/15 pt-1 text-left text-xs leading-snug">{entry.note}</p>}
                {table.selection&&!table.selection.saving&&<SelectionCountdown deadline={table.selection.deadline}/>}
                </button>
                {choosing&&<div data-server-interactive role="group" aria-label={`${quantityLabels.choose}: ${entry.tableLabel}, ${dish.name}`}
                  className="mt-1 grid min-w-[132px] grid-cols-3 items-center gap-1 rounded-lg border border-[#C9A88B]/45 bg-[#241D19] p-1 text-[#F5EDE4]"
                  onPointerDown={event=>event.stopPropagation()}>
                  <button type="button" aria-label={quantityLabels.less} disabled={locked||chosenCount<=1}
                    className="flex h-11 items-center justify-center rounded-md bg-white/5 transition hover:bg-white/10 disabled:opacity-30"
                    onClick={()=>setQuantityChoice({key:entryKey,count:Math.max(1,chosenCount-1)})}><Minus className="h-4 w-4" aria-hidden/></button>
                  <output aria-live="polite" className="text-center text-sm font-bold tabular-nums">{chosenCount}/{entryIds.length}</output>
                  <button type="button" aria-label={quantityLabels.more} disabled={locked||chosenCount>=entryIds.length}
                    className="flex h-11 items-center justify-center rounded-md bg-white/5 transition hover:bg-white/10 disabled:opacity-30"
                    onClick={()=>setQuantityChoice({key:entryKey,count:Math.min(entryIds.length,chosenCount+1)})}><Plus className="h-4 w-4" aria-hidden/></button>
                  <button type="button" aria-label={quantityLabels.confirm} title={quantityLabels.confirm} disabled={locked}
                    className="col-span-3 flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#C9A88B] px-2 text-sm font-semibold text-zinc-950 transition hover:bg-[#DCC1A5] disabled:opacity-40"
                    onClick={()=>{setQuantityChoice(null);onSelect(entryIds.slice(0,chosenCount));}}>
                    <Check className="h-4 w-4" aria-hidden/>{chosenCount}×
                  </button>
                </div>}
                </div>
              </motion.div>;
            })}
          </div>
        </div>
      </motion.section>)}
      </div>
    </div>}
  </div>;
}
