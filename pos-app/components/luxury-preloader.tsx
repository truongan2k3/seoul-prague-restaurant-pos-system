"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  PRELOADER_SESSION_KEY,
  PRELOADER_SLIDES,
} from "@/lib/preloader-slides";

const SAFETY_MS = 10_000;

export function LuxuryPreloader() {
  const [playing, setPlaying] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (sessionStorage.getItem(PRELOADER_SESSION_KEY) === "1") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sessionStorage.setItem(PRELOADER_SESSION_KEY, "1");
      return;
    }

    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;

    finishedRef.current = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      sessionStorage.setItem(PRELOADER_SESSION_KEY, "1");
      document.body.style.overflow = previousOverflow;
      setPlaying(false);
    };

    const safetyTimer = window.setTimeout(finish, SAFETY_MS);

    let ctx: gsap.Context | undefined;
    const startTimer = window.setTimeout(() => {
      const overlay = overlayRef.current;
      const subtitle = subtitleRef.current;
      const title = titleRef.current;
      const progress = progressFillRef.current;
      const separator = separatorRef.current;

      if (!overlay || !subtitle || !title || !progress || !separator) {
        finish();
        return;
      }

      gsap.set(progress, { scaleX: 0, transformOrigin: "left center" });
      gsap.set(separator, { scaleX: 0, transformOrigin: "center center" });

      ctx = gsap.context(() => {
        const tl = gsap.timeline({
          defaults: { ease: "power3.out" },
          onComplete: finish,
        });

        tl.to(separator, {
          scaleX: 1,
          duration: 0.8,
          ease: "power2.inOut",
        });

        PRELOADER_SLIDES.forEach((slide, index) => {
          tl.call(() => {
            subtitle.textContent = slide.lang;
            title.textContent = slide.title;
            gsap.set([subtitle, title], { y: 32, opacity: 0 });
          });

          tl.to(
            [subtitle, title],
            {
              y: 0,
              opacity: 1,
              duration: 0.55,
              stagger: 0.09,
            },
            index === 0 ? "-=0.15" : undefined,
          );

          tl.to(
            progress,
            {
              scaleX: (index + 1) / PRELOADER_SLIDES.length,
              duration: 0.55,
              ease: "power2.inOut",
            },
            "<",
          );

          tl.to({}, { duration: 0.38 });

          if (index < PRELOADER_SLIDES.length - 1) {
            tl.to([subtitle, title], {
              y: -24,
              opacity: 0,
              duration: 0.42,
              stagger: 0.06,
              ease: "power2.in",
            });
          }
        });

        tl.to([subtitle, title], {
          y: -16,
          opacity: 0,
          duration: 0.35,
          ease: "power2.in",
        });

        tl.to(
          overlay,
          {
            yPercent: -100,
            duration: 1.15,
            ease: "power4.inOut",
          },
          "+=0.08",
        );
      }, overlay);
    }, 0);

    return () => {
      window.clearTimeout(safetyTimer);
      window.clearTimeout(startTimer);
      ctx?.revert();
      document.body.style.overflow = previousOverflow;
    };
  }, [playing]);

  if (!playing) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0d0d0d] will-change-transform"
      aria-hidden={!playing}
      aria-label="Loading"
    >
      <div className="flex w-full max-w-3xl flex-col items-center px-8 text-center">
        <p
          ref={subtitleRef}
          className="mb-5 text-[10px] font-medium uppercase tracking-[0.55em] text-zinc-500 sm:text-[11px]"
        >
          {PRELOADER_SLIDES[0].lang}
        </p>

        <h1
          ref={titleRef}
          className="preloader-serif text-4xl italic leading-tight text-zinc-100 sm:text-5xl md:text-6xl lg:text-7xl"
        >
          {PRELOADER_SLIDES[0].title}
        </h1>

        <div
          ref={separatorRef}
          className="mt-10 h-px w-24 bg-gradient-to-r from-transparent via-red-500/70 to-transparent sm:w-32"
        />

        <div className="mt-8 h-px w-48 overflow-hidden bg-zinc-800 sm:w-56">
          <div ref={progressFillRef} className="h-full w-full origin-left bg-red-600/90" />
        </div>

        <p className="mt-14 text-[9px] font-medium uppercase tracking-[0.45em] text-zinc-600">
          Seoul Prague
        </p>
        <p className="mt-1 text-[9px] uppercase tracking-[0.35em] text-zinc-700">
          Korean BBQ · Praha
        </p>
      </div>
    </div>
  );
}
