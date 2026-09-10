"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { BookingCta } from "@/components/landing/booking-cta";
import { LandingImage } from "@/lib/website/landing-image";
import type { WebsiteContent } from "@/lib/website/types";

interface LandingHeroProps {
  content: WebsiteContent;
}

type HeroSlide = {
  id: string;
  src: string;
  objectPosition: string;
};

/** Prefer admin promo slides; otherwise fade through site photography. */
function buildHeroSlides(content: WebsiteContent): HeroSlide[] {
  const promo =
    content.settings.promoSlideshows.find((entry) => entry.id === "promo-main") ??
    content.settings.promoSlideshows.find((entry) => entry.enabled) ??
    content.settings.promoSlideshows[0];

  const promoSlides =
    promo?.enabled === false
      ? []
      : (promo?.slides ?? [])
          .filter((slide) => slide.enabled && slide.imageUrl.trim())
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((slide) => ({
            id: slide.id,
            src: slide.imageUrl.trim(),
            objectPosition: "50% 50%",
          }));

  if (promoSlides.length > 0) return promoSlides;

  const ambient: HeroSlide[] = [];
  const push = (id: string, src: string | undefined | null, objectPosition?: string) => {
    const url = src?.trim();
    if (!url) return;
    if (ambient.some((slide) => slide.src === url)) return;
    ambient.push({
      id,
      src: url,
      objectPosition: objectPosition ?? "50% 50%",
    });
  };

  push("hero", content.media.hero_image?.fileUrl, content.media.hero_image?.objectPosition);
  push("about", content.media.about_image?.fileUrl, content.media.about_image?.objectPosition);
  push("sig1", content.media.signature_1?.fileUrl, content.media.signature_1?.objectPosition);
  push("sig2", content.media.signature_2?.fileUrl, content.media.signature_2?.objectPosition);
  push("sig3", content.media.signature_3?.fileUrl, content.media.signature_3?.objectPosition);

  for (const item of content.gallery) {
    if (ambient.length >= 6) break;
    push(`gallery-${item.id}`, item.imageUrl);
  }

  return ambient;
}

export function LandingHero({ content }: LandingHeroProps) {
  const reduceMotion = useReducedMotion();
  const { settings } = content;
  const slides = useMemo(() => buildHeroSlides(content), [content]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (reduceMotion || slides.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 5600);
    return () => window.clearInterval(timer);
  }, [reduceMotion, slides.length]);

  const active = slides[index] ?? slides[0];

  return (
    <section
      id="home"
      className="relative flex min-h-[100svh] items-end overflow-hidden bg-[#0B0B0C] pb-24 pt-28 lg:pb-32"
    >
      <div className="absolute inset-0" aria-hidden>
        {slides.length > 0 ? (
          slides.map((slide, slideIndex) => {
            const visible = reduceMotion ? slideIndex === 0 : slideIndex === index;
            return (
              <div
                key={slide.id}
                className="absolute inset-0 transition-opacity duration-[1600ms] ease-in-out"
                style={{ opacity: visible ? 1 : 0 }}
              >
                <LandingImage
                  src={slide.src}
                  alt=""
                  fill
                  priority={slideIndex === 0}
                  sizes="100vw"
                  quality={68}
                  className="object-cover"
                  style={{ objectPosition: slide.objectPosition }}
                />
              </div>
            );
          })
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#3a1218_0%,#0B0B0C_55%)]" />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0C] via-[#0B0B0C]/70 to-black/30" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 lg:px-8">
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="mb-4 text-xs font-medium uppercase tracking-[0.35em] text-[#C9A88B]"
        >
          {settings.restaurantName}
        </motion.p>
        <motion.h1
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.25 }}
          className="landing-serif max-w-4xl text-4xl font-medium leading-[1.05] text-white sm:text-5xl lg:text-7xl"
        >
          {settings.heroHeadline}
        </motion.h1>
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4 }}
          className="mt-5 max-w-xl text-lg text-white/80 lg:text-xl"
        >
          {settings.heroTagline}
        </motion.p>
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.55 }}
          className="mt-3 max-w-2xl text-sm text-white/60"
        >
          {settings.heroDescription}
        </motion.p>
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.7 }}
          className="mt-10 flex flex-wrap gap-4"
        >
          <BookingCta size="lg" />
          <Link
            href="/menu"
            className="inline-flex items-center justify-center border border-white/25 px-8 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/10"
          >
            View menu
          </Link>
        </motion.div>

        {slides.length > 1 && !reduceMotion ? (
          <div className="mt-8 flex items-center gap-2" aria-label="Hero slideshow">
            {slides.map((slide, slideIndex) => (
              <button
                key={slide.id}
                type="button"
                aria-label={`Show slide ${slideIndex + 1}`}
                aria-current={slideIndex === index}
                onClick={() => setIndex(slideIndex)}
                className={`h-1 rounded-full transition-all ${
                  slideIndex === index ? "w-8 bg-[#C9A88B]" : "w-2.5 bg-white/35 hover:bg-white/55"
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 text-white/50 lg:block">
        <ChevronDown className="h-6 w-6 animate-bounce" />
      </div>

      {active ? (
        <span className="sr-only">
          Background slide {index + 1} of {slides.length}
        </span>
      ) : null}
    </section>
  );
}
