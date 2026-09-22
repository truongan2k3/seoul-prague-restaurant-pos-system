"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LandingImage } from "@/lib/website/landing-image";

export const CFD_WELCOME_MS = 6000;

export type CfdWelcomeContent = {
  guestName: string;
  isReturning: boolean;
  tableLabel?: string | null;
};

/**
 * Cinematic reception welcome — CSS/Framer only (no heavy media).
 * Logo uses next/image via LandingImage when URL is provided.
 */
export function CfdWelcomeOverlay({
  content,
  logoUrl,
  restaurantName,
  onDone,
}: {
  content: CfdWelcomeContent;
  logoUrl?: string;
  restaurantName: string;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const headline = content.isReturning ? "WELCOME BACK" : "WELCOME";
  const tableLine = content.tableLabel?.trim()
    ? `Table ${content.tableLabel.trim()}`
    : "Table: Unassigned";

  useEffect(() => {
    const hideAt = window.setTimeout(() => setVisible(false), CFD_WELCOME_MS - 700);
    const doneAt = window.setTimeout(onDone, CFD_WELCOME_MS);
    return () => {
      window.clearTimeout(hideAt);
      window.clearTimeout(doneAt);
    };
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-[#0B0B0C]"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.65, ease: [0.22, 1, 0.36, 1] }}
      role="dialog"
      aria-live="polite"
      aria-label={headline}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(139,30,45,0.28) 0%, transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(201,168,139,0.12) 0%, transparent 45%)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C9A88B]/50 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#C9A88B]/35 to-transparent" />

      <div className="relative z-10 flex max-w-3xl flex-col items-center px-8 text-center">
        {logoUrl ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8"
          >
            <LandingImage
              src={logoUrl}
              alt={restaurantName}
              width={96}
              height={96}
              sizes="96px"
              quality={80}
              priority
              className="h-20 w-20 object-contain sm:h-24 sm:w-24"
            />
          </motion.div>
        ) : (
          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.05 }}
            className="mb-6 text-xs font-medium uppercase tracking-[0.4em] text-[#C9A88B]"
          >
            {restaurantName}
          </motion.p>
        )}

        <motion.p
          initial={reduceMotion ? false : { opacity: 0, letterSpacing: "0.55em" }}
          animate={{ opacity: 1, letterSpacing: "0.35em" }}
          transition={{ duration: 1.1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="text-[11px] font-semibold uppercase text-[#C9A88B] sm:text-xs"
        >
          Seoul Prague
        </motion.p>

        <motion.h1
          initial={reduceMotion ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="landing-serif mt-5 text-5xl font-medium leading-[1.05] text-[#F5EDE4] sm:text-6xl lg:text-7xl"
        >
          {headline}
        </motion.h1>

        <motion.div
          initial={reduceMotion ? false : { scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.55 }}
          className="mt-7 h-px w-24 origin-center bg-[#C9A88B]/70"
        />

        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.7 }}
          className="landing-serif mt-7 text-3xl text-white/90 sm:text-4xl"
        >
          {content.guestName}
        </motion.p>

        <motion.p
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.95 }}
          className="mt-4 text-sm uppercase tracking-[0.22em] text-white/45"
        >
          {tableLine}
        </motion.p>
      </div>
    </motion.div>
  );
}
