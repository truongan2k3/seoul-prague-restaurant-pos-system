"use client";

import Link from "next/link";
import { Check, Moon, Sun } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { HalloweenScene } from "@/components/landing/halloween-atmosphere";
import { PosHalloweenEffectsToggle } from "@/components/landing/pos-halloween-effects-toggle";

export function WebsiteThemeSelector() {
  const { theme, setTheme, translate } = useApp();
  return (
    <div className="mt-4">
      <div role="group" aria-label="Theme" className="grid grid-cols-2 gap-3">
        {(["light", "dark"] as const).map(mode => (
          <button key={mode} type="button" aria-pressed={theme === mode} onClick={() => setTheme(mode)}
            className={`relative min-h-[86px] rounded-xl border p-4 text-left transition-colors ${theme === mode ? "border-[#C9A88B] ring-1 ring-[#C9A88B]/40" : "border-gray-200 dark:border-gray-700"} ${mode === "light" ? "bg-[#f7f5f3] text-[#302a25]" : "bg-[#141416] text-[#F5EDE4]"}`}>
            {mode === "light" ? <Sun className="mb-2 h-4 w-4" /> : <Moon className="mb-2 h-4 w-4" />}
            <span className="text-sm font-medium">{translate(mode === "light" ? "lightMode" : "darkMode")}</span>
            {theme === mode && <Check className="absolute right-3 top-3 h-4 w-4" aria-hidden />}
          </button>
        ))}
        <button type="button" aria-pressed={theme === "halloween"} onClick={() => setTheme("halloween")}
          className={`group relative col-span-2 isolate min-h-[210px] overflow-hidden rounded-2xl border bg-[#100d10] text-left text-[#F3E7D7] transition-[border-color,box-shadow] ${theme === "halloween" ? "border-[#C58350] shadow-[0_0_32px_-15px_#BD6B38] ring-1 ring-[#C58350]/40" : "border-[#8A533A]/50 hover:border-[#C58350]"}`}>
          <HalloweenScene variant="preview" />
          <div className="relative z-10 max-w-[78%] px-5 py-7">
            <p className="mb-4 text-[9px] uppercase tracking-[0.3em] text-[#D4A17C]">Seoul Prague · After dark</p>
            <p className="landing-serif text-[1.7rem] leading-tight">Halloween</p>
            <span className="mt-2 inline-flex rounded-full border border-[#BC7D50]/35 bg-black/25 px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] text-[#EDBD92]">Animated Edition</span>
            <p className="mt-3 max-w-[210px] text-xs leading-relaxed text-[#D3BDAA]">Copper leaves. Candlelit nights.<br />A little mystery, beautifully served.</p>
          </div>
          {theme === "halloween" && <Check className="absolute right-4 top-4 z-10 h-4 w-4 text-[#E6BC94]" aria-hidden />}
          <span className="sr-only">Halloween — Animated</span>
        </button>
      </div>
      {theme === "halloween" && <div className="mt-3"><PosHalloweenEffectsToggle /></div>}
      <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">Saved for this browser. Animated Halloween on POS and the website. POS decorations pause during dialogs and data entry.</p>
      <Link href="/" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-medium text-[#A4663B] underline underline-offset-4 dark:text-[#D4A17C]">Preview website ↗</Link>
    </div>
  );
}
