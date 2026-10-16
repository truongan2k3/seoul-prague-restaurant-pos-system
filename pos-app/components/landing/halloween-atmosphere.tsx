"use client";

import { useEffect, useId, useLayoutEffect, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/contexts/app-context";
import { CUSTOMER_WEBSITE_PATH } from "@/lib/website/theme";
import { usePosSeasonalEffects } from "@/lib/pos-seasonal-effects";

function CopperLeaf({ slender = false }: { slender?: boolean }) {
  return (
    <svg viewBox="0 0 40 52" fill="none" focusable="false">
      <path fill="currentColor" d={slender
        ? "M20 2C2 14 4 32 19 43 34 34 39 16 20 2Z"
        : "m20 1 5 12 8-5-1 12 8 3-12 9 2 9-10-3-9 4 1-10L0 23l9-4-1-10 8 5Z"} />
      <path d="M20 11v39M20 25l-9-5m9 12 10-9" stroke="#F1C8A2" strokeOpacity=".3" strokeWidth=".8" />
    </svg>
  );
}

function CarvedPumpkin() {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 160 142" fill="none" focusable="false">
      <defs>
        <radialGradient id={`${id}-skin`} cx=".37" cy=".24" r=".9">
          <stop stopColor="#B36E38" /><stop offset=".5" stopColor="#773718" /><stop offset="1" stopColor="#24100D" />
        </radialGradient>
        <radialGradient id={`${id}-light`}>
          <stop stopColor="#FFE5A7" /><stop offset=".6" stopColor="#E6A247" /><stop offset="1" stopColor="#9A4822" />
        </radialGradient>
      </defs>
      <ellipse cx="80" cy="130" rx="58" ry="6" fill="#000" opacity=".45" />
      <path d="M75 28c-3-12 1-21 11-25l7 8c-10 2-12 8-11 17" fill="#5A4B31" />
      <path d="M80 30C46 9 6 38 12 79c3 31 22 49 52 48l16-2 16 2c30 1 49-17 52-48 6-41-34-70-68-49Z" fill={`url(#${id}-skin)`} stroke="#C0834C" strokeOpacity=".25" />
      <ellipse cx="80" cy="77" rx="28" ry="50" fill={`url(#${id}-skin)`} />
      <path d="M54 32C31 48 33 103 56 123m50-91c23 16 21 71-2 91M79 30c-8 22-8 69 0 95" stroke="#2F170F" strokeOpacity=".4" strokeWidth="2" />
      <g className="hw-pumpkin-flame" fill={`url(#${id}-light)`}>
        <path d="m41 65 22 9-18 8Zm78 0-22 9 18 8ZM75 83l5-9 5 9Z" />
        <path d="m48 96 16 4 5-5 9 7 9-7 5 5 20-4c-7 15-18 19-32 19S56 111 48 96Z" />
      </g>
    </svg>
  );
}

/** Deterministic, decorative SVG/CSS only: no animation timers or asset requests. */
export function HalloweenScene({ variant }: { variant: "hero" | "preview" | "ambient" | "pos" }) {
  const scenic = variant !== "ambient";
  return (
    <div className={`hw-scene hw-scene--${variant}`} aria-hidden="true">
      {scenic && <>
        <div className="hw-candlelight" />
        <div className="hw-moon"><div className="hw-cloud" /></div>
        <div className="hw-fog hw-fog--back" /><div className="hw-fog hw-fog--front" />
        <div className="hw-pumpkin"><CarvedPumpkin /></div>
        {variant !== "pos" && <div className="hw-pumpkin hw-pumpkin--small"><CarvedPumpkin /></div>}
        {Array.from({length: variant === "pos" ? 1 : 2}, (_, index) => (
          <div key={index} className="hw-bat" style={{ "--bat-delay": `${-index * 13}s`, "--bat-top": `${15 + index * 9}%` } as CSSProperties}>
            <svg viewBox="0 0 100 40" fill="currentColor" focusable="false">
              <path d="M50 17 45 8l-2 9C31 17 15 2 1 3c5 9 8 17 6 28 8-9 17-11 22-4 6-7 14-3 21 10 7-13 15-17 21-10 5-7 14-5 22 4-2-11 1-19 6-28-14-1-30 14-42 14L55 8Z" />
            </svg>
          </div>
        ))}
      </>}
      {Array.from({ length: variant === "preview" || variant === "pos" ? 4 : 8 }, (_, index) => (
        <div key={`leaf-${index}`} className={`hw-leaf hw-leaf--${index % 2 ? "right" : "left"} ${index >= 4 ? "hw-detail-secondary" : ""}`} style={{
          "--leaf-delay": `${-index * 4.7}s`, "--leaf-duration": `${23 + index * 2.3}s`,
          "--leaf-size": `${13 + index % 3 * 5}px`, "--leaf-offset": `${index % 4 * 2.5}%`,
        } as CSSProperties}><CopperLeaf slender={index % 3 === 0} /></div>
      ))}
      {Array.from({ length: scenic && variant !== "pos" ? 10 : 4 }, (_, index) => (
        <i key={`ember-${index}`} className={`hw-ember ${index >= 4 ? "hw-detail-secondary" : ""}`} style={{
          "--ember-left": `${8 + index * 9}%`, "--ember-delay": `${-index * 1.9}s`,
          "--ember-duration": `${8 + index % 4 * 2}s`,
        } as CSSProperties} />
      ))}
    </div>
  );
}

export function HalloweenHeroAtmosphere() {
  const { theme } = useApp();
  if (theme !== "halloween") return null;
  return <>
    <HalloweenScene variant="hero" />
    <div className="hw-seasonal-signature" aria-label="Halloween at Seoul Prague">
      <span>A night to remember</span>
      <p>Halloween at Seoul Prague</p>
      <span className="hw-seasonal-rule" />
    </div>
  </>;
}

/** Public decoration and POS palette are scoped separately, including portal dialogs. */
export function HalloweenThemeRuntime() {
  const pathname = usePathname();
  const { theme } = useApp();
  const [posEffectsEnabled] = usePosSeasonalEffects();
  const active = theme === "halloween" && CUSTOMER_WEBSITE_PATH.test(pathname ?? "");
  const posActive = theme === "halloween" && (pathname === "/app" || pathname === "/app/");
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (active) root.dataset.websiteTheme = "halloween";
    else delete root.dataset.websiteTheme;
    if (posActive) root.dataset.posTheme = "halloween";
    else delete root.dataset.posTheme;
    return () => {
      delete root.dataset.websiteTheme;
      delete root.dataset.posTheme;
    };
  }, [active, posActive]);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => { root.dataset.seasonalMotion = document.hidden ? "paused" : "running"; };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      delete root.dataset.seasonalMotion;
    };
  }, []);
  if (active) return <HalloweenScene variant="ambient" />;
  return posActive && posEffectsEnabled ? <HalloweenScene variant="pos" /> : null;
}
