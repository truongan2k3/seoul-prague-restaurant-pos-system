"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/src/lib/supabase";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";
import { subscribePosSoftRefresh } from "@/lib/pos-refresh";
import type { GrillCompanionStore } from "@/lib/server-screen";
import type { DishCompletion } from "@/lib/dish-preparation";
import type { Station } from "@/lib/types";

type SharedSide={parent_item_id:string;companion_id:string;completed_at:string|null;changed_at:string};
const keyOf=(row:SharedSide)=>`${row.parent_item_id}::${row.companion_id}`;
const syncMessage=(message:string)=>/does not exist|schema cache/i.test(message)?"Apply supabase/patch-kds-companion-sync.sql to sync grill sides between kitchen devices.":message;

/** Bridge the existing companion store, including Layout 1, without changing its interactions. */
export function useSharedGrillCompanions(store:GrillCompanionStore,setStore:Dispatch<SetStateAction<GrillCompanionStore>>,station:Station,bootstrapped:boolean){
  const [error,setError]=useState<string|null>(null);
  const live=useRef(store);
  const previousDone=useRef(store.done);
  const versions=useRef(new Map<string,string>());
  const pending=useRef(new Set<string>());
  const deferred=useRef(new Map<string,SharedSide>());
  useLayoutEffect(()=>{live.current=store;});
  const parentKey=Object.values(store.anchors).map(anchor=>anchor.parentId).sort().join(",");

  const apply=useCallback((rows:SharedSide[])=>{
    const accepted=rows.filter(row=>{
      const key=keyOf(row);
      if(pending.current.has(key)){
        if((deferred.current.get(key)?.changed_at??"")<=row.changed_at)deferred.current.set(key,row);
        return false;
      }
      if((versions.current.get(key)??"")>row.changed_at)return false;
      versions.current.set(key,row.changed_at);
      return true;
    });
    if(!accepted.length)return;
    const baseline={...previousDone.current};
    for(const row of accepted){if(row.completed_at)baseline[keyOf(row)]=row.completed_at;else delete baseline[keyOf(row)];}
    previousDone.current=baseline;
    setStore(previous=>{
      let changed=false;const done={...previous.done};
      for(const row of accepted){
        const key=keyOf(row);
        if(row.completed_at){if(done[key]!==row.completed_at){done[key]=row.completed_at;changed=true;}}
        else if(key in done){delete done[key];changed=true;}
      }
      return changed?{...previous,done}:previous;
    });
  },[setStore]);

  const persist=useCallback(async(changes:Array<{parent_item_id:string;companion_id:string;completed_at:string|null}>)=>{
    if(!changes.length)return [] as SharedSide[];
    const keys=changes.map(row=>`${row.parent_item_id}::${row.companion_id}`);
    keys.forEach(key=>pending.current.add(key));
    try{
      const {data,error:writeError}=await supabase.rpc("set_grill_companion_states",{p_changes:changes});
      if(writeError)throw new Error(syncMessage(writeError.message));
      keys.forEach(key=>pending.current.delete(key));
      const rows=(data??[]) as SharedSide[];
      const waiting=keys.flatMap(key=>{const row=deferred.current.get(key);deferred.current.delete(key);return row?[row]:[];});
      apply([...rows,...waiting]);setError(null);return rows;
    }catch(cause){
      const message=cause instanceof Error?cause.message:"Unable to sync grill sides.";
      setError(message);throw new Error(message);
    }finally{
      keys.forEach(key=>pending.current.delete(key));
      const waiting=keys.flatMap(key=>{const row=deferred.current.get(key);deferred.current.delete(key);return row?[row]:[];});
      apply(waiting);
    }
  },[apply]);

  useEffect(()=>{
    if(!bootstrapped||!parentKey)return;
    let cancelled=false;
    const parents=parentKey.split(",");
    const unsubscribers:Array<()=>void>=[];
    const loaders:Array<()=>Promise<void>>=[];
    for(let offset=0;offset<parents.length;offset+=100){
      const ids=parents.slice(offset,offset+100);
      unsubscribers.push(subscribeToPostgresRowChanges(`grill-sides-${station}`,{
        event:"*",schema:"public",table:"kds_companion_states",filter:`parent_item_id=in.(${ids.join(",")})`,
      },payload=>{if(!cancelled&&payload.eventType!=="DELETE")apply([payload.new as unknown as SharedSide]);}));
      let fetching=false;
      const load=async()=>{
        if(fetching||cancelled)return;
        fetching=true;
        try {
        const {data,error:readError}=await supabase.from("kds_companion_states").select("parent_item_id,companion_id,completed_at,changed_at").in("parent_item_id",ids);
        if(cancelled)return;
        if(readError){setError(syncMessage(readError.message));return;}
        const rows=(data??[]) as SharedSide[];
        const existing=new Set(rows.map(keyOf));
        apply(rows);setError(null);
        // Import old local markers only when the shared record does not exist.
        const seeds=Object.entries(live.current.done).filter(([key])=>ids.includes(key.split("::")[0])&&!existing.has(key)).map(([key,completed_at])=>{
          const [parent_item_id,companion_id]=key.split("::");return {parent_item_id,companion_id,completed_at};
        });
        if(seeds.length){
          const {error:seedError}=await supabase.from("kds_companion_states").upsert(seeds,{onConflict:"parent_item_id,companion_id",ignoreDuplicates:true});
          if(seedError&&!cancelled)setError(syncMessage(seedError.message));
        }
        } catch {if(!cancelled)setError("Unable to load shared grill-side states.");}
        finally {fetching=false;}
      };
      loaders.push(load);void load();
    }
    const reload=()=>{if(!document.hidden)void Promise.all(loaders.map(load=>load()));};
    const unsubscribeRefresh=subscribePosSoftRefresh(reload);
    window.addEventListener("online",reload);
    document.addEventListener("visibilitychange",reload);
    return()=>{
      cancelled=true;unsubscribers.forEach(unsubscribe=>unsubscribe());unsubscribeRefresh();
      window.removeEventListener("online",reload);document.removeEventListener("visibilitychange",reload);
    };
  },[parentKey,station,bootstrapped,apply]);

  useEffect(()=>{
    if(!bootstrapped){previousDone.current=store.done;return;}
    const parents=new Set(parentKey.split(","));
    const changes:Array<{parent_item_id:string;companion_id:string;completed_at:string|null}>=[];
    for(const key of new Set([...Object.keys(previousDone.current),...Object.keys(store.done)])){
      if(previousDone.current[key]===store.done[key])continue;
      const [parent_item_id,companion_id]=key.split("::");
      if(parents.has(parent_item_id))changes.push({parent_item_id,companion_id,completed_at:store.done[key]??null});
    }
    previousDone.current=store.done;
    if(changes.length)void persist(changes).catch(()=>{});
  },[store.done,parentKey,bootstrapped,persist]);

  const complete=useCallback(async(ids:string[]):Promise<DishCompletion[]>=>{
    const completed_at=new Date().toISOString();
    const rows=await persist(ids.map(key=>{
      const [parent_item_id,companion_id]=key.split("::");return {parent_item_id,companion_id,completed_at};
    }));
    return rows.filter(row=>row.completed_at).map(row=>({id:keyOf(row),completedAt:row.completed_at!}));
  },[persist]);
  return {complete,error};
}
