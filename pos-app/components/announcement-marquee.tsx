"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import {
  clampMarqueeDurationSeconds,
  isMarqueeVisibleOn,
  marqueeFontFamilyStack,
  type MarqueeSurface,
} from "@/lib/marquee-settings";

export function AnnouncementMarquee({
  surface = "pos",
  tone = "amber",
}: {
  surface?: MarqueeSurface;
  /** amber = main POS; dark = KDS/bar/client on dark backgrounds */
  tone?: "amber" | "dark";
}) {
  const { settings } = useSettings();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const active = useMemo(
    () => isMarqueeVisibleOn(settings, surface, now),
    [settings, surface, now],
  );
  if (!active) return null;

  const text = settings.marqueeText.trim();
  const duration = clampMarqueeDurationSeconds(settings.marqueeDurationSeconds);
  const fontFamily = marqueeFontFamilyStack(settings.marqueeFontFamily);

  const shell =
    tone === "dark"
      ? "relative shrink-0 overflow-hidden border-b border-amber-500/40 bg-amber-500 text-zinc-950"
      : "relative shrink-0 overflow-hidden border-b border-amber-600/40 bg-amber-400 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500 dark:text-amber-950";

  const badge =
    tone === "dark"
      ? "pointer-events-none absolute left-0 top-0 z-10 flex h-full items-center bg-gradient-to-r from-amber-500 via-amber-500/95 to-transparent px-3"
      : "pointer-events-none absolute left-0 top-0 z-10 flex h-full items-center bg-gradient-to-r from-amber-400 via-amber-400/95 to-transparent px-3 dark:from-amber-500 dark:via-amber-500/95";

  return (
    <div className={shell} role="marquee" aria-live="polite">
      <div className={badge}>
        <Megaphone className="h-4 w-4 shrink-0" aria-hidden />
      </div>

      {/* Single copy: enter from right, exit left, then restart (not a seamless loop). */}
      <div
        className="pos-marquee-track inline-block whitespace-nowrap py-2 pl-[100%]"
        style={{
          animationDuration: `${duration}s`,
          fontFamily,
        }}
      >
        <span className="px-8 text-sm font-semibold tracking-wide sm:text-base">{text}</span>
      </div>
    </div>
  );
}
