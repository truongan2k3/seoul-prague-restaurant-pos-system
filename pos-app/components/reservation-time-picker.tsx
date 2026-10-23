"use client";

type TimeOption = string | { time: string; label?: string; disabled?: boolean };
/** Standard dropdown with explicit 24-hour times and the existing availability labels. */
export function ReservationTimePicker({ value, onChange, label, options, disabled = false, dark = false, placeholder = "—" }: {
  value: string; onChange: (time: string) => void; label: string; options?: TimeOption[];
  disabled?: boolean; dark?: boolean; placeholder?: string;
}) {
  const rows: { time: string; label?: string; disabled?: boolean }[] = options?.map((entry) => typeof entry === "string" ? { time: entry } : entry)
    ?? Array.from({ length: 96 }, (_, index) => ({
      time: `${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`,
      label: undefined,
    }));

  return (
    <select
      aria-label={label}
      value={rows.length === 0 ? "" : value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || rows.length === 0}
      className={dark
        ? "mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30 disabled:opacity-60"
        : "pos-input mt-2"}
    >
      {rows.length === 0 ? <option value="">{placeholder}</option> : rows.map((row) => (
        <option key={row.time} value={row.time} disabled={row.disabled}>
          {row.time}{row.label ? ` — ${row.label}` : ""}
        </option>
      ))}
    </select>
  );
}
