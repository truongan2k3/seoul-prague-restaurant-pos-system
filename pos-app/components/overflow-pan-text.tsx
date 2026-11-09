"use client";

import { useEffect, useRef } from "react";

/** Reveal overflowing text end-to-end, then return, without duplicating its accessible text. */
export function OverflowPanText({ text, respectReducedMotion = true }: { text: string; respectReducedMotion?: boolean }) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = textRef.current;
    if (!viewport || !content) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | null = null;
    let frame: number | null = null;
    let previousDistance = -1;
    let disposed = false;

    const measure = () => {
      frame = null;
      if (disposed) return;
      const distance = Math.max(0, content.scrollWidth - viewport.clientWidth);
      if (distance <= 1 || (respectReducedMotion && preference.matches) || typeof content.animate !== "function") {
        animation?.cancel();
        animation = null;
        previousDistance = distance;
        return;
      }
      // Resizes/font events with the same dimensions must not restart an active cycle.
      if (distance === previousDistance && animation) return;
      animation?.cancel();
      previousDistance = distance;
      const hold = 1000;
      const travel = Math.max(800, distance / 24 * 1000);
      const duration = 2 * (hold + travel);
      const end = `translateX(-${distance}px)`;
      animation = content.animate([
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: hold / duration, easing: "ease-in-out" },
        { transform: end, offset: (hold + travel) / duration },
        { transform: end, offset: (2 * hold + travel) / duration, easing: "ease-in-out" },
        { transform: "translateX(0)", offset: 1 },
      ], { duration, iterations: Infinity, easing: "linear" });
      if (document.hidden) animation.pause();
    };
    const schedule = () => {
      if (disposed) return;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    const onPreference = () => {
      animation?.cancel();
      animation = null;
      schedule();
    };
    const onVisibility = () => {
      if (document.hidden) animation?.pause();
      else {
        animation?.play();
        schedule();
      }
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(viewport);
    observer?.observe(content);
    window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", onVisibility);
    preference.addEventListener("change", onPreference);
    const fonts = document.fonts;
    fonts?.addEventListener("loadingdone", schedule);
    void fonts?.ready.then(schedule).catch(() => {});
    schedule();

    return () => {
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      animation?.cancel();
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", onVisibility);
      preference.removeEventListener("change", onPreference);
      fonts?.removeEventListener("loadingdone", schedule);
    };
  }, [text, respectReducedMotion]);

  return <span ref={viewportRef} className="block min-w-0 overflow-hidden whitespace-nowrap">
    <span ref={textRef} className="inline-block w-max max-w-none align-top">{text}</span>
  </span>;
}
