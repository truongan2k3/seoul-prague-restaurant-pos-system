"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  PRELOADER_SESSION_KEY,
  PRELOADER_SLIDES,
} from "@/lib/preloader-slides";

export function LuxuryPreloader() {
  const [visible, setVisible] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem(PRELOADER_SESSION_KEY) === "1") {
      return;
    }

    setVisible(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      sessionStorage.setItem(PRELOADER_SESSION_KEY, "1");
      document.body.style.overflow = previousOverflow;
      setVisible(false);
      return;
    }

    gsap.set(progressFillRef.current, { scaleX: 0, transformOrigin: "left center" });
    gsap.set(separatorRef.current, { scaleX: 0, transformOrigin: "center center" });

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => {
          sessionStorage.setItem(PRELOADER_SESSION_KEY, "1");
          document.body.style.overflow = previousOverflow;
          setVisible(false);
        },
      });

      tl.to(separatorRef.current, {
        scaleX: 1,
        duration: 0.8,
        ease: "power2.inOut",
      });

      PRELOADER_SLIDES.forEach((slide, index) => {
        tl.call(() => {
          if (subtitleRef.current) subtitleRef.current.textContent = slide.lang;
          if (titleRef.current) titleRef.current.textContent = slide.title;
          gsap.set([subtitleRef.current, titleRef.current], { y: 32, opacity: 0 });
        });

        tl.to(
          [subtitleRef.current, titleRef.current],
          {
            y: 0,
            opacity: 1,
            duration: 0.55,
            stagger: 0.09,
          },
          index === 0 ? "-=0.15" : undefined,
        );

        tl.to(
          progressFillRef.current,
          {
            scaleX: (index + 1) / PRELOADER_SLIDES.length,
            duration: 0.55,
            ease: "power2.inOut",
          },
          "<",
        );

        tl.to({}, { duration: 0.38 });

        if (index < PRELOADER_SLIDES.length - 1) {
          tl.to([subtitleRef.current, titleRef.current], {
            y: -24,
            opacity: 0,
            duration: 0.42,
            stagger: 0.06,
            ease: "power2.in",
          });
        }
      });

      tl.to([subtitleRef.current, titleRef.current], {
        y: -16,
        opacity: 0,
        duration: 0.35,
        ease: "power2.in",
      });

      tl.to(
        overlayRef.current,
        {
          yPercent: -100,
          duration: 1.15,
          ease: "power4.inOut",
        },
        "+=0.08",
      );
    }, overlayRef);

    return () => {
      ctx.revert();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0d0d0d] will-change-transform"
      aria-hidden={!visible}
      aria-label="Loading"
    >
      <div
        ref={contentRef}
        className="flex w-full max-w-3xl flex-col items-center px-8 text-center"
      >
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
