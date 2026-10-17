"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DISH_DONE_VISIBLE_MS, DISH_SELECTION_MS, type DishCompletion, type DishEntry, type DishSelection } from "@/lib/dish-preparation";

/** Mounted by the board, never by Layout 2: switching layouts cannot restart a timer. */
export function useDishPreparation({entries,completedTimes,nowMs,blocked,externalSelected,onComplete}:{
  entries:DishEntry[];
  completedTimes:Map<string,string>;
  nowMs:number;
  blocked:boolean;
  externalSelected:Set<string>;
  onComplete:(ids:string[])=>Promise<DishCompletion[]>;
}) {
  const [selections,setSelections]=useState(new Map<string,DishSelection>());
  const [completed,setCompleted]=useState(new Map<string,DishEntry>());
  const [error,setError]=useState<string|null>(null);
  const live=useRef({entries,completedTimes,blocked,externalSelected,onComplete});
  useLayoutEffect(()=>{live.current={entries,completedTimes,blocked,externalSelected,onComplete};});
  const timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const selected=useRef(new Map<string,DishSelection>());
  const lastEntries=useRef(new Map<string,DishEntry>());
  const due=useRef(new Set<string>());
  const queuedDrain=useRef<ReturnType<typeof setTimeout>|null>(null);
  const missingSince=useRef(new Map<string,number>());
  const running=useRef(false);
  const mounted=useRef(true);
  const drainRef=useRef<()=>void>(()=>{});

  const clearEntry=useCallback((id:string)=>{
    const timer=timers.current.get(id);
    if(timer)clearTimeout(timer);
    timers.current.delete(id);
    selected.current.delete(id);
    due.current.delete(id);
  },[]);

  const drain=useCallback(async()=>{
    if(running.current||live.current.blocked||!mounted.current)return;
    running.current=true;
    try {
      while(due.current.size&&!live.current.blocked&&mounted.current){
        const currentEntries=new Map(live.current.entries.map(entry=>[entry.id,entry]));
        const ids=Array.from(due.current).filter(id=>{
          const entry=currentEntries.get(id);
          return entry&&!entry.completedAt&&selected.current.has(id);
        });
        const queued=Array.from(due.current);
        due.current.clear();
        if(!ids.length){queued.forEach(clearEntry);setSelections(new Map(selected.current));continue;}
        const snapshots=new Map(ids.map(id=>[id,currentEntries.get(id)!]));
        try {
          const results=await live.current.onComplete(ids);
          if(!mounted.current)return;
          setCompleted(previous=>{
            const next=new Map(previous);
            for(const result of results){
              const entry=snapshots.get(result.id);
              if(entry)next.set(result.id,{...entry,completedAt:result.completedAt});
            }
            return next;
          });
        } catch(cause){
          if(mounted.current){
            setError(cause instanceof Error?cause.message:"Unable to complete these items. Tap again to retry.");
            const partial=cause&&typeof cause==="object"&&"completed" in cause ? cause.completed as DishCompletion[] : [];
            if(Array.isArray(partial))setCompleted(previous=>{
              const next=new Map(previous);
              for(const result of partial){const entry=snapshots.get(result.id);if(entry)next.set(result.id,{...entry,completedAt:result.completedAt});}
              return next;
            });
          }
        }
        ids.forEach(clearEntry);
        queued.filter(id=>!ids.includes(id)).forEach(clearEntry);
        if(mounted.current)setSelections(new Map(selected.current));
      }
    } finally {running.current=false;}
  },[clearEntry]);
  useLayoutEffect(()=>{drainRef.current=()=>{void drain();};},[drain]);
  useEffect(()=>{if(!blocked)drainRef.current();},[blocked]);

  useEffect(()=>{
    mounted.current=true;
    return()=>{
      mounted.current=false;
      if(queuedDrain.current)clearTimeout(queuedDrain.current);
      queuedDrain.current=null;
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      selected.current.clear();
      due.current.clear();
    };
  },[]);

  // Observe authoritative completion, including another tablet or Layout 1.
  useEffect(()=>{
    const byId=new Map(entries.map(entry=>[entry.id,entry]));
    const previousEntries=lastEntries.current;
    let selectionChanged=false;
    for(const id of selected.current.keys()){
      const entry=byId.get(id);
      if(!entry||entry.completedAt||completedTimes.has(id)){
        clearEntry(id);selectionChanged=true;
      }
    }
    if(selectionChanged)setSelections(new Map(selected.current));
    setCompleted(previous=>{
      let changed=false;
      const next=new Map(previous);
      for(const [id,entry] of byId){
        if(entry.completedAt&&nowMs-new Date(entry.completedAt).getTime()<DISH_DONE_VISIBLE_MS){
          if(next.get(id)?.completedAt!==entry.completedAt){next.set(id,entry);changed=true;}
        } else if(!entry.completedAt&&previousEntries.get(id)?.completedAt){
          changed=next.delete(id)||changed;
        }
      }
      for(const [id,completedAt] of completedTimes){
        const entry=previousEntries.get(id);
        if(entry&&nowMs-new Date(completedAt).getTime()<DISH_DONE_VISIBLE_MS&&next.get(id)?.completedAt!==completedAt){
          next.set(id,{...entry,completedAt});changed=true;
        }
      }
      for(const [id,entry] of next){
        if(nowMs-new Date(entry.completedAt!).getTime()>=DISH_DONE_VISIBLE_MS){next.delete(id);changed=true;}
      }
      return changed?next:previous;
    });
    // Briefly remember disappearing rows so an archive event cannot race its completion event.
    const remembered=new Map(byId);
    for(const id of byId.keys())missingSince.current.delete(id);
    for(const [id,entry] of previousEntries){
      if(remembered.has(id))continue;
      const since=missingSince.current.get(id)??nowMs;
      missingSince.current.set(id,since);
      if(nowMs-since<DISH_DONE_VISIBLE_MS)remembered.set(id,entry);
      else missingSince.current.delete(id);
    }
    lastEntries.current=remembered;
  },[entries,completedTimes,nowMs,clearEntry]);

  const select=useCallback((ids:string[],count?:number)=>{
    const current=new Map(live.current.entries.map(entry=>[entry.id,entry]));
    setError(null);
    const cancellable=ids.filter(id=>{const selection=selected.current.get(id);return selection&&!selection.saving;});
    if(count===undefined&&cancellable.length){
      cancellable.forEach(clearEntry);
      setSelections(new Map(selected.current));
      return;
    }
    if(count!==undefined){
      // Adjust only this send's exact IDs; other tables keep their deadlines.
      if(ids.some(id=>selected.current.get(id)?.saving))return;
      const eligible=Array.from(new Set(ids)).filter(id=>{
        const entry=current.get(id);
        return entry&&!entry.completedAt&&!live.current.externalSelected.has(id);
      });
      cancellable.forEach(clearEntry);
      ids=eligible.slice(0,Math.max(0,Math.min(eligible.length,Math.floor(count))));
    }
    const deadline=Date.now()+DISH_SELECTION_MS;
    for(const id of ids){
      const entry=current.get(id);
      // Saving entries are locked; independent timers for other entries stay untouched.
      if(!entry||entry.completedAt||selected.current.has(id)||live.current.externalSelected.has(id))continue;
      selected.current.set(id,{deadline,saving:false});
      timers.current.set(id,setTimeout(()=>{
        timers.current.delete(id);
        const selection=selected.current.get(id);
        if(!selection||!mounted.current)return;
        selected.current.set(id,{...selection,saving:true});
        setSelections(new Map(selected.current));
        due.current.add(id);
        if(!queuedDrain.current)queuedDrain.current=setTimeout(()=>{
          queuedDrain.current=null;drainRef.current();
        },0);
      },Math.max(0,deadline-Date.now())));
    }
    setSelections(new Map(selected.current));
  },[clearEntry]);

  const visible=useMemo(()=>{
    const result=new Map(completed);
    for(const entry of entries){
      if(entry.completedAt){
        if(nowMs-new Date(entry.completedAt).getTime()<DISH_DONE_VISIBLE_MS)result.set(entry.id,entry);
      } else if(!completed.has(entry.id))result.set(entry.id,entry);
    }
    return Array.from(result.values()).filter(entry=>!entry.completedAt||nowMs-new Date(entry.completedAt).getTime()<DISH_DONE_VISIBLE_MS);
  },[entries,completed,nowMs]);

  return {entries:visible,selections,select,error,hasPending:selections.size>0};
}
