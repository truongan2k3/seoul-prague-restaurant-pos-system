"use client";

import { useEffect, useMemo, useState } from "react";
import { clampMarqueeDurationSeconds, marqueeFontFamilyStack } from "@/lib/marquee-settings";

export function MarqueeSequenceTrack({
  messages,
  durationSeconds,
  fontFamily,
  className = "pos-marquee-track-once inline-block whitespace-nowrap py-2 pl-[100%]",
  textClassName = "px-8 text-sm font-semibold tracking-wide sm:text-base",
}: {
  messages: string[];
  durationSeconds: number;
  fontFamily: string;
  className?: string;
  textClassName?: string;
}) {
  const activeMessages = useMemo(
    () => messages.map((message) => message.trim()).filter(Boolean),
    [messages],
  );
  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const duration = clampMarqueeDurationSeconds(durationSeconds);

  useEffect(() => {
    setIndex(0);
    setCycle(0);
  }, [activeMessages.join("\u0001"), duration]);

  if (activeMessages.length === 0) return null;

  const text = activeMessages[index % activeMessages.length];

  return (
    <div
      key={`${cycle}-${index}-${text}`}
      className={className}
      style={{
        animationDuration: `${duration}s`,
        fontFamily,
      }}
      onAnimationEnd={() => {
        if (activeMessages.length > 1) {
          setIndex((current) => (current + 1) % activeMessages.length);
        } else {
          setCycle((current) => current + 1);
        }
      }}
    >
      <span className={textClassName}>{text}</span>
    </div>
  );
}
