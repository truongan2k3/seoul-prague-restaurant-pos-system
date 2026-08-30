"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { PRELOADER_SLIDES } from "@/lib/preloader-slides";

const INTRO_TOTAL_SECONDS = 3;
const SAFETY_MS = 4_000;

export function LuxuryPreloader() {
  const pathname = usePathname();
  const [playing, setPlaying] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    finishedRef.current = false;
    setPlaying(true);
  }, [pathname]);

  useEffect(() => {
    if (!playing) return;

    finishedRef.current = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
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
      gsap.set(overlay, { yPercent: 0 });

      ctx = gsap.context(() => {
        const tl = gsap.timeline({
          defaults: { ease: "power3.out" },
          onComplete: finish,
        });

        tl.to(separator, {
          scaleX: 1,
          duration: 0.2,
          ease: "power2.inOut",
        });

        PRELOADER_SLIDES.forEach((slide, index) => {
          tl.call(() => {
            subtitle.textContent = slide.lang;
            title.textContent = slide.title;
            gsap.set([subtitle, title], { y: 20, opacity: 0 });
          });

          tl.to(
            [subtitle, title],
            {
              y: 0,
              opacity: 1,
              duration: 0.22,
              stagger: 0.04,
            },
            index === 0 ? "-=0.1" : undefined,
          );

          tl.to(
            progress,
            {
              scaleX: (index + 1) / PRELOADER_SLIDES.length,
              duration: 0.22,
              ease: "power2.inOut",
            },
            "<",
          );

          tl.to({}, { duration: 0.08 });

          if (index < PRELOADER_SLIDES.length - 1) {
            tl.to([subtitle, title], {
              y: -14,
              opacity: 0,
              duration: 0.14,
              stagger: 0.03,
              ease: "power2.in",
            });
          }
        });

        tl.to([subtitle, title], {
          y: -10,
          opacity: 0,
          duration: 0.12,
          ease: "power2.in",
        });

        tl.to(
          overlay,
          {
            yPercent: -100,
            duration: 0.45,
            ease: "power4.inOut",
          },
          "+=0.02",
        );

        const naturalDuration = tl.duration();
        if (naturalDuration > INTRO_TOTAL_SECONDS) {
          tl.timeScale(naturalDuration / INTRO_TOTAL_SECONDS);
        }
      }, overlay);
    }, 0);

    return () => {
      window.clearTimeout(safetyTimer);
      window.clearTimeout(startTimer);
      ctx?.revert();
      document.body.style.overflow = previousOverflow;
    };
  }, [playing, pathname]);

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
