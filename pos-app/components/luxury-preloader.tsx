"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

const INTRO_HOLD_MS = 350;

const SKIP_PRELOADER_PREFIXES = [
  "/",
  "/menu",
  "/landing",
  "/admin",
  "/reservation",
  "/login",
  "/register",
  "/status",
];

function shouldSkipPreloader(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/") return true;
  return SKIP_PRELOADER_PREFIXES.some(
    (prefix) => prefix !== "/" && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
}

export function LuxuryPreloader() {
  const pathname = usePathname();
  const [playing, setPlaying] = useState(false);
  const shownThisLoad = useRef(false);

  useEffect(() => {
    setPlaying(false);
    if (!pathname || shouldSkipPreloader(pathname) || shownThisLoad.current
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    shownThisLoad.current = true;
    setPlaying(true);
    const timer = window.setTimeout(() => setPlaying(false), INTRO_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return <AnimatePresence>
    {playing && <motion.div
      key="brand-intro"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0B0B0C]"
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(201,168,139,0.08),transparent_65%)]" />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}
        className="relative flex flex-col items-center px-6 text-center">
        <div className="preloader-serif mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-[#C9A88B]/35 text-lg tracking-[0.1em] text-[#C9A88B]">SP</div>
        <p className="preloader-serif text-3xl tracking-[0.12em] text-[#F5EDE4] sm:text-4xl">SEOUL PRAGUE</p>
        <div className="my-5 h-px w-20 bg-gradient-to-r from-transparent via-[#C9A88B]/60 to-transparent" />
        <p className="text-[9px] uppercase tracking-[0.35em] text-[#C9A88B]/70">Korean BBQ &amp; Dining</p>
      </motion.div>
    </motion.div>}
  </AnimatePresence>;
}
