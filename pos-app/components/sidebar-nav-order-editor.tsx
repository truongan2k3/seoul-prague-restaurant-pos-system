"use client";

import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { DEFAULT_SIDEBAR_NAV_ORDER, normalizeSidebarNavOrder, SIDEBAR_TABS } from "@/lib/sidebar-navigation";
import type { NavId } from "@/lib/types";

export function SidebarNavOrderEditor({ value, onChange, disabled }: {
  value: NavId[];
  onChange: (order: NavId[]) => void;
  disabled?: boolean;
}) {
  const { translate: t } = useApp();
  const order = normalizeSidebarNavOrder(value);
  const move = (index: number, direction: number) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return <section className="rounded-xl border border-[#C9A88B]/20 bg-[#141416] p-6 md:col-span-2">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold text-white">{t("settingsNavOrderTitle")}</h2>
        <p className="mt-1 text-sm text-white/60">{t("settingsNavOrderHint")}</p>
      </div>
      <button type="button" disabled={disabled} onClick={() => onChange([...DEFAULT_SIDEBAR_NAV_ORDER])} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-[#DCC1A5] disabled:opacity-40">
        <RotateCcw className="h-4 w-4" aria-hidden="true"/>{t("settingsNavOrderReset")}
      </button>
    </div>
    <ol className="mt-4 grid gap-2 sm:grid-cols-2">
      {order.map((id, index) => {
        const tab = SIDEBAR_TABS.find(tab => tab.id === id)!;
        const label = t(tab.labelKey);
        return <li key={id} className="flex min-w-0 items-center gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2">
          <span className="w-5 shrink-0 text-xs tabular-nums text-[#C9A88B]">{index + 1}</span>
          <span className="min-w-0 flex-1 text-sm text-white/85">{label}</span>
          {[-1, 1].map(direction => <button key={direction} type="button" disabled={disabled || index + direction < 0 || index + direction >= order.length} onClick={() => move(index, direction)} aria-label={`${t(direction < 0 ? "settingsNavMoveUp" : "settingsNavMoveDown")}: ${label}`} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 text-[#DCC1A5] hover:bg-white/10 focus-visible:outline focus-visible:outline-[#C9A88B] disabled:opacity-25">
            {direction < 0 ? <ArrowUp className="h-4 w-4"/> : <ArrowDown className="h-4 w-4"/>}
          </button>)}
        </li>;
      })}
    </ol>
  </section>;
}
