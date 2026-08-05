"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import {
  clampMarqueeDurationSeconds,
  isMarqueeActive,
  marqueeFontFamilyStack,
} from "@/lib/marquee-settings";

export function AnnouncementMarquee() {
  const { settings } = useSettings();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const active = useMemo(() => isMarqueeActive(settings, now), [settings, now]);
  if (!active) return null;

  const text = settings.marqueeText.trim();
  const duration = clampMarqueeDurationSeconds(settings.marqueeDurationSeconds);
  const fontFamily = marqueeFontFamilyStack(settings.marqueeFontFamily);

  return (
    <div
      className="relative shrink-0 overflow-hidden border-b border-amber-600/40 bg-amber-400 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500 dark:text-amber-950"
      role="marquee"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex h-full items-center bg-gradient-to-r from-amber-400 via-amber-400/95 to-transparent px-3 dark:from-amber-500 dark:via-amber-500/95">
        <Megaphone className="h-4 w-4 shrink-0" aria-hidden />
      </div>

      <div
        className="pos-marquee-track flex w-max items-center py-2 pl-10"
        style={{
          animationDuration: `${duration}s`,
          fontFamily,
        }}
      >
        <span className="pos-marquee-segment px-8 text-sm font-semibold tracking-wide sm:text-base">
          {text}
        </span>
        <span className="pos-marquee-segment px-8 text-sm font-semibold tracking-wide sm:text-base" aria-hidden>
          {text}
        </span>
      </div>
    </div>
  );
}
