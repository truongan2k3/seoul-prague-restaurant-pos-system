"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { formatVoucherAmount } from "@/lib/voucher";

export const POS_VOUCHER_APPLIED_MS = 2800;

export type PosVoucherAppliedContent = {
  amountCzk: number;
  code?: string;
};

/**
 * Cinematic “Voucher Applied” feedback — same visual language as CFD Welcome.
 * Does not change redeem status; apply-only celebration.
 */
export function PosVoucherAppliedOverlay({
  content,
  onDone,
  title = "Voucher Applied",
}: {
  content: PosVoucherAppliedContent;
  onDone: () => void;
  title?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const amountLine = `−${formatVoucherAmount(content.amountCzk)}`;

  useEffect(() => {
    const hideAt = window.setTimeout(() => setVisible(false), POS_VOUCHER_APPLIED_MS - 450);
    const doneAt = window.setTimeout(onDone, POS_VOUCHER_APPLIED_MS);
    return () => {
      window.clearTimeout(hideAt);
      window.clearTimeout(doneAt);
    };
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-[140] flex items-center justify-center overflow-hidden bg-[#0B0B0C]"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
      role="dialog"
      aria-live="polite"
      aria-label={title}
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

      <div className="relative z-10 flex max-w-xl flex-col items-center px-8 text-center">
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, letterSpacing: "0.55em" }}
          animate={{ opacity: 1, letterSpacing: "0.35em" }}
          transition={{ duration: 0.85, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="text-[11px] font-semibold uppercase text-[#C9A88B] sm:text-xs"
        >
          Seoul Prague
        </motion.p>

        <motion.h1
          initial={reduceMotion ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="landing-serif mt-5 text-4xl font-medium leading-[1.05] text-[#F5EDE4] sm:text-5xl lg:text-6xl"
        >
          {title}
        </motion.h1>

        <motion.div
          initial={reduceMotion ? false : { scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.65, delay: 0.35 }}
          className="mt-6 h-px w-20 origin-center bg-[#C9A88B]/70"
        />

        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.45 }}
          className="landing-serif mt-6 text-3xl tabular-nums text-white/95 sm:text-4xl"
        >
          {amountLine}
        </motion.p>

        {content.code ? (
          <motion.p
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-4 max-w-full truncate font-mono text-xs uppercase tracking-[0.18em] text-white/40"
          >
            {content.code}
          </motion.p>
        ) : null}
      </div>
    </motion.div>
  );
}
