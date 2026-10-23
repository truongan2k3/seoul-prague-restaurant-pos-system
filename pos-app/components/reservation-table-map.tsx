"use client";

import { useMemo } from "react";
import { Check, MapPin, Users, X } from "lucide-react";
import { t } from "@/lib/i18n/translations";
import { floorTableByLabel } from "@/lib/reservation-floor-plan";
import { MAX_NEW_RESERVATION_TABLES, normalizeReservationTableIds } from "@/lib/reservation-tables";
import { TABLE_CARD_WIDTH, resolveFloorCardOverlaps } from "@/lib/table-layout";
import type { LanguageCode, ReservationRecord, RestaurantTable } from "@/lib/types";
import { checkInTableIssue, checkInTableIssues, isExclusiveCheckInConflict } from "@/lib/reservation-check-in";
import { resolveGrill } from "@/lib/reservation-capacity-engine";
import type { TableAvailabilitySource } from "@/lib/table-availability";

/** Selection-only floor plan: shares the POS's saved positions and never writes them. */
export function ReservationTableMap({tables,value,onChange,language,disabled=false,maxTables=MAX_NEW_RESERVATION_TABLES,allowOccupied=false,allowBlocked=false,checkIn,onCheckInAnyway}:{
  tables:RestaurantTable[];value:string[];onChange:(ids:string[])=>void;language:LanguageCode;
  disabled?:boolean;maxTables?:number;allowOccupied?:boolean;allowBlocked?:boolean;
  checkIn?:{reservation:ReservationRecord;reservations:ReservationRecord[];partySize:number;durationMinutes:number;bufferMinutes:number};
  onCheckInAnyway?:(reason:string)=>void;
}) {
  const ids=normalizeReservationTableIds(value);
  const seatingSource:TableAvailabilitySource|null=checkIn?{
    serverNow:new Date().toISOString(),durationMinutes:checkIn.durationMinutes,bufferMinutes:checkIn.bufferMinutes,
    tables:tables.flatMap(table=>{const config=floorTableByLabel(table.label);return config?[{...config,id:table.id,occupied:table.status!=="empty",occupiedAt:table.occupiedAt?.toISOString()??null,blocked:table.availabilityBlocked===true}]:[];}),
    reservations:checkIn.reservations,
  }:null;
  const issueFor=(id:string)=>seatingSource&&checkIn?checkInTableIssue(seatingSource,id,checkIn.reservation.id,checkIn.partySize,resolveGrill(checkIn.reservation),ids):null;
  const selectedIssues=seatingSource&&checkIn?ids.flatMap(id=>checkInTableIssues(seatingSource,id,checkIn.reservation.id,checkIn.partySize,resolveGrill(checkIn.reservation),ids)):[];
  const warningMessages=[...new Set(selectedIssues.map(issue=>issue.message))];
  const hardConflict=selectedIssues.some(issue=>isExclusiveCheckInConflict(issue.code)||["TABLE_NOT_CONFIGURED","INVALID_PARTY_SIZE"].includes(issue.code));
  const floor=useMemo(()=>{
    const positions=resolveFloorCardOverlaps(tables.map(table=>({id:table.id,x:table.posX,y:table.posY})));
    const points=Object.values(positions);
    const left=Math.min(0,...points.map(point=>point.x));
    const top=Math.min(0,...points.map(point=>point.y));
    return {positions,left,top,width:Math.max(560,...points.map(point=>point.x-left+TABLE_CARD_WIDTH+24)),height:Math.max(220,...points.map(point=>point.y-top+128+24))};
  },[tables]);
  const toggle=(id:string)=>{
    if(disabled)return;
    if(ids.includes(id))onChange(ids.filter(current=>current!==id));
    else if(maxTables===1)onChange([id]);
    else if(ids.length<maxTables)onChange([...ids,id]);
  };
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="inline-flex items-center gap-2 text-[var(--muted)]"><MapPin className="h-3.5 w-3.5"/>{t(language,"selectTable")}</span>
      <span className="tabular-nums text-[#C9A88B]">{ids.length} / {maxTables}</span>
    </div>
    <div className="max-h-[50dvh] overflow-auto rounded-2xl border border-[#C9A88B]/20 bg-[#0D0D10] p-2 [color-scheme:dark]">
      <svg viewBox={`0 0 ${floor.width} ${floor.height}`} className="block w-full" style={{minWidth:Math.max(520,Math.ceil(floor.width*0.4))}} role="group" aria-label={t(language,"selectTable")}>
        {tables.map(table=>{
          const pos=floor.positions[table.id];
          if(!pos)return null;
          const selected=ids.includes(table.id);
          const issue=issueFor(table.id);
          const statusKey=issue?issue.code==="TABLE_RESERVED"?"resTableReserved":issue.code==="TABLE_ACTIVE_CHECK_IN"?"resStatusCheckedIn":issue.code==="TABLE_BLOCKED"?"resTableBlocked":issue.code==="TABLE_OCCUPIED"?table.status:"resTableNotSuitable":table.status;
          const occupied=table.status!=="empty";
          const locked=disabled||(!selected&&((issue&&isExclusiveCheckInConflict(issue.code))||(table.availabilityBlocked===true&&!allowBlocked)||(maxTables>1&&ids.length>=maxTables)||(!allowOccupied&&occupied)));
          const capacity=floorTableByLabel(table.label)?.capacity;
          return <foreignObject key={table.id} x={pos.x-floor.left} y={pos.y-floor.top} width={TABLE_CARD_WIDTH} height={128}>
            <button type="button" aria-pressed={selected} disabled={locked} onClick={()=>toggle(table.id)}
              title={issue?.message}
              aria-label={`${t(language,"table")} ${table.label}, ${t(language,statusKey)}${capacity?`, ${capacity} ${t(language,"partySize")}`:""}`}
              className={`relative flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border text-white transition duration-200 motion-reduce:transition-none disabled:opacity-35 ${selected?"border-[#DCC1A5] bg-[#C9A88B]/20 shadow-[inset_0_0_0_1px_rgba(201,168,139,0.3)]":"border-white/15 bg-[#19191E] hover:border-[#C9A88B]/65 hover:bg-[#242125]"}`}>
              <span className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-md border ${selected?"border-[#C9A88B] bg-[#C9A88B] text-black":"border-white/20"}`}>{selected&&<Check className="h-3.5 w-3.5"/>}</span>
              <span className="text-3xl font-bold tracking-wide">{table.label}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-white/70"><span className={`h-1.5 w-1.5 rounded-full ${occupied||issue?"bg-amber-300":"bg-emerald-300"}`}/>{t(language,statusKey)}</span>
              {capacity&&<span className="flex items-center gap-1 text-[11px] text-white/45"><Users className="h-3 w-3"/>{capacity}</span>}
            </button>
          </foreignObject>;
        })}
      </svg>
    </div>
    {warningMessages.length>0&&<div role="alert" className={`space-y-3 rounded-xl border px-3 py-3 text-xs leading-relaxed ${hardConflict?"border-red-400/30 bg-red-400/10 text-red-700 dark:text-red-200":"border-amber-400/25 bg-amber-400/10 text-amber-800 dark:text-amber-100"}`}>
      <ul className="list-disc space-y-1 pl-4">{warningMessages.map(message=><li key={message}>{message}</li>)}</ul>
      {!hardConflict&&onCheckInAnyway&&<>
        <p className="opacity-80">{t(language,"checkInOverrideHint")}</p>
        <button type="button" disabled={disabled} onClick={()=>onCheckInAnyway(warningMessages.join("\n"))} className="min-h-11 w-full rounded-lg bg-amber-300 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">{t(language,"checkInOverrideContinue")}</button>
      </>}
    </div>}
    <div className="flex min-h-8 flex-wrap gap-2" aria-live="polite">
      {ids.map(id=><button key={id} type="button" disabled={disabled} onClick={()=>toggle(id)} className="inline-flex items-center gap-2 rounded-lg border border-[#C9A88B]/30 bg-[#C9A88B]/10 px-3 py-2 text-sm font-semibold text-[var(--foreground)]">
        {tables.find(table=>table.id===id)?.label??"—"}<X aria-hidden className="h-3.5 w-3.5 opacity-50"/>
      </button>)}
    </div>
    {maxTables>1&&<p className="text-xs text-[var(--muted)]">{t(language,"selectSecondTableHint").replace("{max}",String(maxTables))}</p>}
    {checkIn?.reservation.referralCodeId&&ids.length>1&&<p className="rounded-xl border border-[#C9A88B]/25 bg-[#C9A88B]/10 px-3 py-2 text-xs leading-relaxed text-[var(--foreground)]">{t(language,"checkInReferralPrimaryOnly").replace("{table}",tables.find(table=>table.id===ids[0])?.label??"—")}</p>}
  </div>;
}
