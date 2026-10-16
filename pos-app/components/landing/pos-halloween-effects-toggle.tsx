"use client";

import { Sparkles } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { usePosSeasonalEffects } from "@/lib/pos-seasonal-effects";

export function PosHalloweenEffectsToggle({ compact = false }: { compact?: boolean }) {
  const { theme } = useApp();
  const [enabled, setEnabled] = usePosSeasonalEffects();
  if (theme !== "halloween") return null;
  const label = enabled ? "Pause Halloween animations" : "Enable Halloween animations";
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={enabled}
      onClick={() => setEnabled(!enabled)}
      className={`flex min-h-[44px] w-full items-center rounded-lg border text-xs transition-colors ${compact ? "justify-center px-1" : "gap-2 px-3"} ${enabled ? "border-[#C58350]/45 bg-[#C58350]/10 text-[#EDBD92]" : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--accent)]"}`}>
      <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
      {!compact && <span>Halloween · {enabled ? "Animated" : "Paused"}</span>}
    </button>
  );
}
