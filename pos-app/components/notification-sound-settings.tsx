"use client";

import { useMemo, useRef, useState } from "react";
import { Play, Upload } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { buildSoundSelectOptions } from "@/lib/auto-serve";
import { NOTIFICATION_SOUND_CATEGORIES } from "@/lib/notification-preferences";
import { playTestAlertSound } from "@/lib/notification-sound";
import type { NotificationSoundCategory, SoundConfigs } from "@/lib/types";

export function NotificationSoundSettingsEditor({ value, onChange }: { value: SoundConfigs; onChange: (next: SoundConfigs) => void }) {
  const { translate: t } = useApp();
  const { uploadEventAlertSound } = useSettings();
  const input = useRef<HTMLInputElement>(null);
  const uploadCategory = useRef<NotificationSoundCategory | null>(null);
  const current = useRef(value); current.current = value;
  const [uploading, setUploading] = useState(false);
  const labels = { kitchen: t("notificationKitchen"), bar: t("notificationBar"), newReservation: t("notificationNewReservation"), cancelledReservation: t("notificationCancelledReservation") };
  const options = useMemo(() => buildSoundSelectOptions("", [
    ...Object.values(value).filter((url): url is string => typeof url === "string" && !!url),
    ...Object.values(value.notifications).flatMap(config => config.sounds),
  ]), [value]);
  const soundName = (url: string, label: string) => {
    const file = url.split("/").pop();
    return file === "bell.mp3" ? t("notificationBell") : file === "new_order.mp3" ? t("notificationDoubleBell")
      : file === "chime.mp3" ? t("notificationChime") : file === "success.mp3" ? t("notificationSuccess")
      : file === "buzzer.mp3" ? t("notificationBuzzer") : file === "default-bell.mp3" ? t("notificationClassic") : label;
  };
  const update = (category: NotificationSoundCategory, partial: Partial<SoundConfigs["notifications"][NotificationSoundCategory]>) => {
    onChange({ ...current.current, notifications: { ...current.current.notifications, [category]: { ...current.current.notifications[category], ...partial } } });
  };
  return <section className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-[#121214] p-4 sm:p-6">
    <h2 className="pos-serif text-xl text-[#F5F2EF]">{t("notificationSoundsTitle")}</h2>
    <p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/50">{t("notificationSoundsHint")}</p>
    <input ref={input} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" className="hidden" onChange={async event => {
      const file = event.target.files?.[0]; const category = uploadCategory.current;
      event.target.value=""; if (!file || !category) return;
      setUploading(true);
      try { const url = await uploadEventAlertSound(file); if (url) update(category, { sounds: [...new Set([...current.current.notifications[category].sounds, url])].slice(-12) }); }
      finally { setUploading(false); }
    }} />
    <div className="mt-5 grid gap-4 lg:grid-cols-2">{NOTIFICATION_SOUND_CATEGORIES.map(category => {
      const config = value.notifications[category];
      const hasGlobalSwitch = category === "newReservation" || category === "cancelledReservation";
      return <div key={category} className="rounded-xl border border-[#C9A88B]/20 bg-[#19191C] p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[#E8D5C4]">{labels[category]}</h3>
          {hasGlobalSwitch && <button type="button" role="switch" aria-checked={config.enabled} aria-label={labels[category]} disabled={uploading}
            onClick={() => update(category, { enabled: !config.enabled })}
            className={`flex min-h-11 min-w-16 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition ${config.enabled ? "border-[#C9A88B]/50 bg-[#C9A88B]/15 text-[#E8D5C4]" : "border-white/10 text-white/40"}`}>{t(config.enabled ? "notificationOn" : "notificationOff")}</button>}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-white/40">{t(hasGlobalSwitch ? "notificationGlobalSwitch" : "notificationLocalHint")}</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">{options.map(option => {
          const selected = config.sounds.includes(option.value); const name = soundName(option.value, option.label);
          return <div key={option.value} className={`flex min-w-0 items-center rounded-lg border transition-colors ${selected ? "border-[#C9A88B]/45 bg-[#C9A88B]/10" : "border-white/10 bg-black/10"}`}>
            <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 pl-3 pr-1 text-xs text-white/80">
              <input type="checkbox" checked={selected} disabled={uploading || (selected && config.sounds.length===1) || (!selected && config.sounds.length>=12)} className="h-4 w-4 shrink-0 accent-[#C9A88B]" onChange={() => update(category, { sounds: selected ? config.sounds.filter(url => url!==option.value) : [...config.sounds, option.value] })} />
              <span className="truncate" title={name}>{name}</span>
            </label>
            <button type="button" aria-label={`${t("notificationPreview")}: ${name}`} title={t("notificationPreview")} onClick={() => playTestAlertSound(option.value)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-r-lg text-[#C9A88B] transition hover:bg-white/5"><Play className="h-4 w-4" /></button>
          </div>;
        })}</div>
        <button type="button" disabled={uploading || config.sounds.length>=12} onClick={() => { uploadCategory.current=category; input.current?.click(); }} className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs text-[#C9A88B] disabled:opacity-35"><Upload className="h-3.5 w-3.5" />{t("settingsUploadSound")}</button>
      </div>;
    })}</div>
  </section>;
}
