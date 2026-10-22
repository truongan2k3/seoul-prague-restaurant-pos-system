"use client";

import { Clock3 } from "lucide-react";
import { DINING_TIME_OPTIONS, diningTimeCopy, formatDiningTime } from "@/lib/reservation-dining";

export function ReservationDiningTimeField({ value, onChange, language = "en", disabled = false, dark = false }: {
  value: number; onChange: (minutes: number) => void; language?: string; disabled?: boolean; dark?: boolean;
}) {
  const copy = diningTimeCopy(language);
  return <fieldset disabled={disabled} className="min-w-0 space-y-2">
    <legend className={`flex items-center gap-2 text-sm font-medium ${dark ? "text-white/85" : "text-[var(--foreground)]"}`}><Clock3 aria-hidden className="h-4 w-4 text-[#C9A88B]" />{copy.title}</legend>
    <div className="grid grid-cols-4 gap-2">
      {DINING_TIME_OPTIONS.map((minutes) => <button key={minutes} type="button" aria-pressed={value === minutes} onClick={() => onChange(minutes)}
        className={`min-h-11 rounded-xl border px-1.5 py-2 text-xs font-medium tabular-nums transition-colors disabled:opacity-40 ${value === minutes ? "border-[#C9A88B] bg-[#C9A88B]/20 text-[#C9A88B]" : dark ? "border-white/15 bg-white/[0.025] text-white/70 hover:border-[#C9A88B]/50" : "border-[var(--border)] text-[var(--foreground)] hover:border-[#C9A88B]/50"}`}>{formatDiningTime(minutes, language)}</button>)}
    </div>
    <p className={`text-xs leading-relaxed ${dark ? "text-white/45" : "text-[var(--muted)]"}`}>{copy.hint}</p>
  </fieldset>;
}
