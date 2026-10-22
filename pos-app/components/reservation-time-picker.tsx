"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Clock3 } from "lucide-react";

type TimeOption = string | { time: string; label?: string };
/** Explicit 24-hour controls; independent of the device's AM/PM preference. */
export function ReservationTimePicker({ value, onChange, label, options, disabled = false, dark = false, placeholder = "—" }: {
  value: string; onChange: (time: string) => void; label: string; options?: TimeOption[];
  disabled?: boolean; dark?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [hour, setHour] = useState(value.slice(0, 2) || "18");
  const rows = options?.map((entry) => typeof entry === "string" ? { time: entry } : entry);
  const hours = rows ? [...new Set(rows.map((row) => row.time.slice(0, 2)))] : Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
  const activeHour = hours.includes(hour) ? hour : hours[0] ?? "18";
  const minutes = rows ? rows.filter((row) => row.time.startsWith(`${activeHour}:`))
    : Array.from({ length: 60 }, (_, index) => ({ time: `${activeHour}:${String(index).padStart(2, "0")}`, label: undefined }));
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={root} className="relative mt-2 min-w-0" onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open && !disabled} aria-controls={id}
      disabled={disabled || rows?.length === 0} onClick={() => { setHour(value.slice(0, 2) || hours[0] || "18"); setOpen((current) => !current); }}
      className={`flex min-h-12 w-full items-center gap-2 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50 ${dark ? "border-white/15 bg-[#0B0B0C] text-white" : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]"}`}>
      <Clock3 aria-hidden className="h-4 w-4 text-[#C9A88B]" /><span className="flex-1 font-mono text-lg font-semibold tabular-nums">{rows?.length === 0 ? placeholder : value || placeholder}</span>
      <span className="rounded-md bg-[#C9A88B]/10 px-1.5 py-1 text-[10px] font-semibold text-[#C9A88B]">24h</span><ChevronDown aria-hidden className="h-4 w-4 opacity-50" />
    </button>
    {open && !disabled && <div id={id} role="dialog" aria-label={`${label} · 24h`} className={`absolute left-0 right-0 top-full z-[80] mt-2 min-w-[240px] rounded-2xl border border-[#C9A88B]/30 p-3 shadow-2xl ${dark ? "bg-[#171719] text-white" : "bg-[var(--card)] text-[var(--foreground)]"}`}>
      <p className="mb-2 flex items-center justify-between text-xs font-medium"><span>{label} · HH</span><span className="font-mono text-[#C9A88B]">{activeHour}:··</span></p>
      <div className="grid max-h-48 grid-cols-6 gap-1.5 overflow-y-auto overscroll-contain">
        {hours.map((entry) => <button key={entry} type="button" aria-pressed={entry === activeHour} onClick={() => setHour(entry)}
          className={`min-h-11 rounded-lg border font-mono text-sm tabular-nums ${entry === activeHour ? "border-[#C9A88B] bg-[#C9A88B]/20 text-[#C9A88B]" : "border-[#C9A88B]/15 hover:bg-[#C9A88B]/10"}`}>{entry}</button>)}
      </div>
      <p className="mt-3 border-t border-[#C9A88B]/20 pt-2 text-xs font-mono text-[#C9A88B]">{activeHour}:MM</p>
      <div className="mt-2 grid max-h-44 grid-cols-6 gap-1.5 overflow-y-auto overscroll-contain">
        {minutes.map((row) => <button key={row.time} type="button" title={row.label} aria-label={`${row.time}${row.label ? ` · ${row.label}` : ""}`} aria-pressed={value === row.time}
          onClick={() => { onChange(row.time); setOpen(false); trigger.current?.focus(); }}
          className={`min-h-11 rounded-lg border font-mono text-sm tabular-nums ${value === row.time ? "border-[#C9A88B] bg-[#C9A88B]/20 text-[#C9A88B]" : "border-[#C9A88B]/15 hover:bg-[#C9A88B]/10"}`}>{row.time.slice(3)}</button>)}
      </div>
    </div>}
  </div>;
}
