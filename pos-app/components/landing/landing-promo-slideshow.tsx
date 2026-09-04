"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { WebsiteContent, WebsitePageSection } from "@/lib/website/types";
import {
  responsiveBodyClass,
  responsiveHeadlineClass,
  responsivePaddingClass,
  sectionVisibilityClass,
} from "@/lib/website/page-layout";

export function LandingPromoSlideshow({
  content,
  section,
}: {
  content: WebsiteContent;
  section: WebsitePageSection;
}) {
  const reduceMotion = useReducedMotion();
  const slideshowId = section.props?.slideshowId ?? "promo-main";
  const slideshow = content.settings.promoSlideshows.find((entry) => entry.id === slideshowId);
  const slides = useMemo(
    () =>
      (slideshow?.slides ?? [])
        .filter((slide) => slide.enabled && (slide.imageUrl || slide.title))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [slideshow],
  );

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (reduceMotion || slides.length < 2 || !slideshow?.enabled) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, slideshow.autoplayMs || 5200);
    return () => window.clearInterval(timer);
  }, [reduceMotion, slides.length, slideshow?.autoplayMs, slideshow?.enabled]);

  if (!slideshow?.enabled || slides.length === 0) return null;

  const active = slides[index] ?? slides[0];
  const visibility = sectionVisibilityClass(section);

  return (
    <section
      className={`relative overflow-hidden bg-[#120e0f] ${responsivePaddingClass(section)} ${visibility}`}
    >
      <div className="absolute inset-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={reduceMotion ? false : { opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            {active.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,#5a1d24_0%,#120e0f_55%)]" />
            )}
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/25" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[52vh] max-w-7xl flex-col justify-end px-5 lg:min-h-[58vh] lg:px-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#C9A88B]">
          {section.props?.eyebrow || slideshow.name || "Events"}
        </p>
        <h2
          className={`landing-serif mt-4 max-w-3xl font-medium text-white ${responsiveHeadlineClass(section)}`}
        >
          {active.title || section.props?.headline || "Special evening"}
        </h2>
        <p className={`mt-4 max-w-2xl text-white/75 ${responsiveBodyClass(section)}`}>
          {active.subtitle || section.props?.body || ""}
        </p>
        {active.ctaLabel ? (
          <div className="mt-8">
            <Link
              href={active.ctaHref || "/reservation"}
              className="inline-flex min-h-[48px] items-center rounded-full bg-[#C9A88B] px-6 text-sm font-semibold text-[#1a1210] transition hover:bg-[#d8b89a]"
            >
              {active.ctaLabel}
            </Link>
          </div>
        ) : null}

        {slides.length > 1 ? (
          <div className="mt-10 flex items-center gap-3">
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => setIndex((current) => (current - 1 + slides.length) % slides.length)}
              className="rounded-full border border-white/25 p-2 text-white/80 hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex gap-2">
              {slides.map((slide, slideIndex) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`Go to slide ${slideIndex + 1}`}
                  onClick={() => setIndex(slideIndex)}
                  className={`h-1.5 rounded-full transition ${
                    slideIndex === index ? "w-8 bg-[#C9A88B]" : "w-3 bg-white/35"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => setIndex((current) => (current + 1) % slides.length)}
              className="rounded-full border border-white/25 p-2 text-white/80 hover:bg-white/10"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
