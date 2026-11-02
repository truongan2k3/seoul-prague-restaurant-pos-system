"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Music2, Pencil, Play, Trash2, Upload, X } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { buildSoundSelectOptions, DEFAULT_SOUND_CONFIGS } from "@/lib/auto-serve";
import { DEFAULT_NOTIFICATION_SOUNDS, NOTIFICATION_SOUND_CATEGORIES } from "@/lib/notification-preferences";
import { playTestAlertSound } from "@/lib/notification-sound";
import type { NotificationSoundCategory, SoundConfigs } from "@/lib/types";

export function NotificationSoundSettingsEditor({ value, onChange }: { value: SoundConfigs; onChange: (next: SoundConfigs) => void }) {
  const { translate: t } = useApp();
  const { uploadEventAlertSound, error: settingsError } = useSettings();
  const input = useRef<HTMLInputElement>(null);
  const current = useRef(value); current.current = value;
  const [expanded,setExpanded]=useState<NotificationSoundCategory|null>(null);
  const [editing,setEditing]=useState<{url:string;name:string}|null>(null);
  const [deleting,setDeleting]=useState<string|null>(null);
  const [uploading, setUploading] = useState(false);
  const labels = { kitchen: t("notificationKitchen"), bar: t("notificationBar"), newReservation: t("notificationNewReservation"), cancelledReservation: t("notificationCancelledReservation") };
  const options = useMemo(() => buildSoundSelectOptions("", [
    ...(value.library??[]).map(sound=>sound.url),
    ...Object.values(value).filter((url): url is string => typeof url === "string" && !!url),
    ...Object.values(value.notifications).flatMap(config => config.sounds),
  ]), [value]);
  const uploadedSounds=options.filter(option=>!option.value.startsWith("/sounds/"));
  const soundName = (url: string, label: string) => {
    const custom=value.library?.find(sound=>sound.url===url)?.name;
    if(custom)return custom;
    const file = url.split("/").pop();
    return file === "bell.mp3" ? t("notificationBell") : file === "new_order.mp3" ? t("notificationDoubleBell")
      : file === "chime.mp3" ? t("notificationChime") : file === "success.mp3" ? t("notificationSuccess")
      : file === "buzzer.mp3" ? t("notificationBuzzer") : file === "default-bell.mp3" ? t("notificationClassic") : label;
  };
  const update = (category: NotificationSoundCategory, partial: Partial<SoundConfigs["notifications"][NotificationSoundCategory]>) => {
    onChange({ ...current.current, notifications: { ...current.current.notifications, [category]: { ...current.current.notifications[category], ...partial } } });
  };
  const rename=()=>{
    if(!editing?.name.trim())return;
    const asset={url:editing.url,name:editing.name.trim().slice(0,80)},library=current.current.library??[];
    onChange({...current.current,library:library.some(sound=>sound.url===asset.url)?library.map(sound=>sound.url===asset.url?asset:sound):[...library,asset]});
    setEditing(null);
  };
  const remove=(url:string)=>{
    const next={...current.current,library:(current.current.library??[]).filter(sound=>sound.url!==url),notifications:{...current.current.notifications}};
    for(const category of NOTIFICATION_SOUND_CATEGORIES){
      const config=next.notifications[category],sounds=config.sounds.filter(sound=>sound!==url);
      next.notifications[category]={...config,sounds:sounds.length?sounds:[...DEFAULT_NOTIFICATION_SOUNDS[category].sounds]};
    }
    for(const key of ["callWaiter","newOrder","mainNewOrder","itemReady","paymentSuccess","reservationReminder","cfdWelcome","guestChat"] as const){
      if(next[key]===url)next[key]=DEFAULT_SOUND_CONFIGS[key];
    }
    onChange(next);setDeleting(null);setEditing(null);
  };
  return <section className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-[#121214] p-4 sm:p-6">
    <h2 className="pos-serif text-xl text-[#F5F2EF]">{t("notificationSoundsTitle")}</h2>
    <p className="mt-2 text-sm leading-relaxed text-white/50">{t("notificationSoundPickerHint")}</p>
    {settingsError&&<p role="alert" className="mt-3 text-sm text-rose-300">{settingsError}</p>}
    <input ref={input} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" className="hidden" onChange={async event => {
      const file = event.target.files?.[0];
      event.target.value=""; if (!file) return;
      setUploading(true);
      try {
        const url=await uploadEventAlertSound(file);
        if(!url)return;
        const next={...current.current,library:[...(current.current.library??[]),{url,name:file.name.replace(/\.[^.]+$/,"").slice(0,80)||file.name}]};
        onChange(next);
      } finally { setUploading(false); }
    }} />
    <div className="mt-5 space-y-2">{NOTIFICATION_SOUND_CATEGORIES.map(category => {
      const config = value.notifications[category],open=expanded===category;
      const hasGlobalSwitch = category === "newReservation" || category === "cancelledReservation";
      const selectedNames=config.sounds.map(url=>soundName(url,options.find(option=>option.value===url)?.label??url)).join(" · ");
      return <div key={category} className={`overflow-hidden rounded-xl border bg-[#19191C] ${open?"border-[#C9A88B]/40":"border-white/10"}`}>
        <div className="flex items-center gap-2 px-3 sm:px-4">
          <button type="button" aria-expanded={open} aria-controls={`notification-sounds-${category}`} onClick={()=>setExpanded(open?null:category)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 text-left">
            <Music2 className="h-4 w-4 shrink-0 text-[#C9A88B]"/>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#E8D5C4]">{labels[category]}</span><span title={selectedNames} className="mt-1 block truncate text-xs text-white/50">{selectedNames||t("notificationChooseSounds")}</span></span>
            <span className="text-xs tabular-nums text-white/40">{config.sounds.length}</span><ChevronDown className={`h-4 w-4 shrink-0 text-[#C9A88B] transition-transform motion-reduce:transition-none ${open?"rotate-180":""}`}/>
          </button>
          {hasGlobalSwitch&&<button type="button" role="switch" aria-checked={config.enabled} aria-label={labels[category]} disabled={uploading} onClick={()=>update(category,{enabled:!config.enabled})} className={`min-h-10 min-w-14 shrink-0 rounded-lg border px-2 text-xs font-semibold ${config.enabled?"border-[#C9A88B]/45 bg-[#C9A88B]/15 text-[#E8D5C4]":"border-white/10 text-white/40"}`}>{t(config.enabled?"notificationOn":"notificationOff")}</button>}
        </div>
        {open&&<div id={`notification-sounds-${category}`} className="border-t border-white/10 px-3 pb-4 pt-3 sm:px-4">
          <p className="mb-3 text-xs text-white/45">{t(hasGlobalSwitch?"notificationGlobalSwitch":"notificationLocalHint")}</p>
          <div className="grid max-h-[24rem] gap-2 overflow-y-auto sm:grid-cols-2">{options.map(option=>{
            const selected=config.sounds.includes(option.value),name=soundName(option.value,option.label);
            return <label key={option.value} className={`flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${selected?"border-[#C9A88B]/40 bg-[#C9A88B]/10 text-[#E8D5C4]":"border-white/10 bg-black/10 text-white/75"}`}>
              <input type="checkbox" checked={selected} disabled={uploading||(selected&&config.sounds.length===1)||(!selected&&config.sounds.length>=12)} className="h-4 w-4 shrink-0 accent-[#C9A88B]" onChange={()=>update(category,{sounds:selected?config.sounds.filter(url=>url!==option.value):[...config.sounds,option.value]})}/>
              <span className="truncate" title={name}>{name}</span>
            </label>;
          })}</div>
        </div>}
      </div>;
    })}</div>
    <div className="mt-6 border-t border-white/10 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-[#E8D5C4]">{t("notificationUploadedLibrary")} <span className="ml-1 text-sm font-normal tabular-nums text-white/40">{uploadedSounds.length}</span></h3>
        <button type="button" disabled={uploading} onClick={()=>input.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#C9A88B]/30 px-3 text-sm text-[#DCC1A5] disabled:opacity-40"><Upload className="h-4 w-4"/>{uploading?t("loading"):t("settingsUploadSound")}</button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{uploadedSounds.map(option=>{
        const name=soundName(option.value,option.label);
        return <div key={option.value} className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#19191C]">
          <div className="flex min-w-0 items-center gap-1 px-3 py-1">
            <Music2 className="mr-2 h-4 w-4 shrink-0 text-[#C9A88B]"/>
            <span className="min-w-0 flex-1 truncate text-sm text-white/85" title={name}>{name}</span>
            <button type="button" aria-label={`${t("notificationPreview")}: ${name}`} onClick={()=>playTestAlertSound(option.value)} className="inline-flex h-11 w-10 shrink-0 items-center justify-center rounded-md text-[#C9A88B] hover:bg-white/5"><Play className="h-4 w-4"/></button>
            <button type="button" disabled={uploading} aria-label={`${t("notificationRenameSound")}: ${name}`} onClick={()=>{setEditing({url:option.value,name});setDeleting(null);}} className="inline-flex h-11 w-10 shrink-0 items-center justify-center rounded-md text-white/50 hover:bg-white/5 hover:text-[#DCC1A5]"><Pencil className="h-3.5 w-3.5"/></button>
            <button type="button" disabled={uploading} aria-label={`${t("delete")}: ${name}`} onClick={()=>{setDeleting(option.value);setEditing(null);}} className="inline-flex h-11 w-10 shrink-0 items-center justify-center rounded-md text-white/40 hover:bg-white/5 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5"/></button>
          </div>
          {editing?.url===option.value&&<form className="flex gap-1 border-t border-white/10 p-2" onSubmit={event=>{event.preventDefault();rename();}}>
            <input autoFocus aria-label={t("notificationSoundName")} maxLength={80} value={editing.name} onChange={event=>setEditing({url:option.value,name:event.target.value})} onKeyDown={event=>{if(event.key==="Escape")setEditing(null);}} className="min-h-10 min-w-0 flex-1 rounded-md border border-white/15 bg-black/20 px-2 text-sm text-white outline-none focus:border-[#C9A88B]/60"/>
            <button type="submit" disabled={!editing.name.trim()} aria-label={t("save")} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[#DCC1A5] disabled:opacity-40"><Check className="h-4 w-4"/></button>
            <button type="button" aria-label={t("cancel")} onClick={()=>setEditing(null)} className="inline-flex h-10 w-10 items-center justify-center text-white/50"><X className="h-4 w-4"/></button>
          </form>}
          {deleting===option.value&&<div className="border-t border-white/10 p-3"><p className="text-xs leading-relaxed text-white/65">{t("notificationDeleteSoundHint")}</p><div className="mt-2 flex justify-end gap-2"><button type="button" onClick={()=>setDeleting(null)} className="min-h-10 rounded-md px-3 text-xs text-white/60">{t("cancel")}</button><button type="button" onClick={()=>remove(option.value)} className="min-h-10 rounded-md border border-rose-400/30 bg-rose-400/10 px-3 text-xs text-rose-200">{t("delete")}</button></div></div>}
        </div>;
      })}</div>
      {!uploadedSounds.length&&<p className="mt-3 rounded-lg border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">{t("notificationNoUploadedSounds")}</p>}
    </div>
  </section>;
}
