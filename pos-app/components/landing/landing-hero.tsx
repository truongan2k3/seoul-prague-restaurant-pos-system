"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { BookingCta } from "@/components/landing/booking-cta";
import type { WebsiteContent } from "@/lib/website/types";

interface LandingHeroProps {
  content: WebsiteContent;
}

export function LandingHero({ content }: LandingHeroProps) {
  const reduceMotion = useReducedMotion();
  const { settings, media } = content;
  const heroVideo = media.hero_video?.fileUrl;
  const heroImage = media.hero_image?.fileUrl;

  return (
    <section id="home" className="relative flex min-h-[100svh] items-end overflow-hidden bg-[#0B0B0C] pb-24 pt-28 lg:pb-32">
      {heroVideo ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={heroImage || undefined}
          preload="metadata"
        >
          <source src={heroVideo} type={media.hero_video?.mimeType || "video/mp4"} />
        </video>
      ) : heroImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={heroImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: media.hero_image?.objectPosition ?? "50% 50%" }}
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#3a1218_0%,#0B0B0C_55%)]" />
      )}
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
      </div>

      <div className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 text-white/50 lg:block">
        <ChevronDown className="h-6 w-6 animate-bounce" />
      </div>
    </section>
  );
}
