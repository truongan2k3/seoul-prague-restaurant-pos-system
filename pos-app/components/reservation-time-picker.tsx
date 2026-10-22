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
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const rows = options?.map((entry) => typeof entry === "string" ? { time: entry } : entry)
    ?? Array.from({ length: 96 }, (_, index) => ({
      time: `${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`,
      label: undefined,
    }));
  useEffect(() => {
    if (!open) return;
    const selected = list.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      ?? list.current?.querySelector<HTMLButtonElement>("button");
    if (selected && list.current) {
      list.current.scrollTop = selected.offsetTop - (list.current.clientHeight - selected.offsetHeight) / 2;
      selected.focus({ preventScroll: true });
    }
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={root} className="relative mt-2 min-w-0" onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open && !disabled} aria-controls={id}
      disabled={disabled || rows.length === 0} onClick={() => setOpen((current) => !current)}
      className={`flex min-h-12 w-full items-center gap-2 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50 ${dark ? "border-white/15 bg-[#0B0B0C] text-white" : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]"}`}>
      <Clock3 aria-hidden className="h-4 w-4 text-[#C9A88B]" /><span className="flex-1 font-mono text-lg font-semibold tabular-nums">{rows.length === 0 ? placeholder : value || placeholder}</span>
      <span className="rounded-md bg-[#C9A88B]/10 px-1.5 py-1 text-[10px] font-semibold text-[#C9A88B]">24h</span><ChevronDown aria-hidden className="h-4 w-4 opacity-50" />
    </button>
    {open && !disabled && <div id={id} role="dialog" aria-label={`${label} · 24h`} className={`absolute left-0 right-0 top-full z-[80] mt-2 min-w-0 rounded-2xl border border-[#C9A88B]/30 p-2 shadow-2xl ${dark ? "bg-[#171719] text-white" : "bg-[var(--card)] text-[var(--foreground)]"}`}>
      <div ref={list} className="relative flex max-h-64 flex-col gap-1 overflow-y-auto overscroll-y-contain p-1">
        {rows.map((row) => <button key={row.time} type="button" title={row.label} aria-label={`${row.time}${row.label ? ` · ${row.label}` : ""}`} aria-pressed={value === row.time}
          onClick={() => { onChange(row.time); setOpen(false); trigger.current?.focus(); }}
          className={`min-h-12 w-full shrink-0 whitespace-nowrap rounded-xl border px-3 text-left font-mono text-base font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A88B] motion-reduce:transition-none ${value === row.time ? "border-[#C9A88B] bg-[#C9A88B]/20 text-[#C9A88B]" : "border-transparent hover:bg-[#C9A88B]/10"}`}>{row.time}</button>)}
      </div>
    </div>}
  </div>;
}
