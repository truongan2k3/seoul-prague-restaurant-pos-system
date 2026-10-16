"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Heart } from "lucide-react";
import { formatCzk } from "@/lib/checkout-calculations";
import type { CfdTipOffer, CfdTipPercent } from "@/lib/cfd-tip";

export function CfdTipSelector({ offer, percent, tip, pending, error, onSelect }: {
  offer: CfdTipOffer;
  percent: CfdTipPercent | null;
  tip: number;
  pending: boolean;
  error: boolean;
  onSelect: (percent: CfdTipPercent) => void;
}) {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const feedbackSequence = useRef(0);
  const [feedback, setFeedback] = useState<{id:number;x:number;y:number}|null>(null);
  return (
    <motion.section
      ref={sectionRef}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.4, ease: "easeOut" }}
      aria-labelledby="cfd-tip-heading"
      className="relative isolate my-4 rounded-3xl border border-[#C9A88B]/25 bg-gradient-to-br from-[#24211e] via-[#19191b] to-[#141416] p-4 shadow-[0_12px_36px_-16px_rgba(201,168,139,0.24)] sm:p-5"
    >
      {feedback && !reduceMotion && (
        <div key={feedback.id} aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-3xl">
          {Array.from({length:24}, (_, index) => {
            const angle = index * Math.PI * 2 / 24;
            const spread = 65 + (index % 5) * 18;
            const x = Math.cos(angle) * spread;
            return (
              <motion.span
                key={index}
                className="absolute block"
                style={{left:feedback.x,top:feedback.y,width:index%3===0?5:7,height:index%3===0?5:3,
                  borderRadius:index%3===0?"50%":"1px",backgroundColor:["#C9A88B","#F4DFC8","#E6C56E","#FFF3DB"][index%4]}}
                initial={{x:0,y:0,opacity:0,scale:0.5,rotate:index*15}}
                animate={{x:[0,x*0.7,x],y:[0,-45-Math.abs(Math.sin(angle))*65,35+(index%4)*14],
                  opacity:[0,1,1,0],scale:[0.5,1,1,0.7],rotate:index*15+(index%2===0?240:-240)}}
                transition={{duration:1.05,delay:index*0.008,ease:"easeOut"}}
                onAnimationComplete={index===23 ? () => setFeedback(current => current?.id===feedback.id ? null : current) : undefined}
              />
            );
          })}
        </div>
      )}
      <div className="mb-4 flex items-start gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#C9A88B]/25 bg-[#C9A88B]/10 text-[#DCC1A5]">
          <Heart className="h-[18px] w-[18px]" strokeWidth={1.4} aria-hidden="true" />

        </div>
        <div>
          <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.28em] text-[#C9A88B]">A little appreciation</p>
          <h2 id="cfd-tip-heading" className="landing-serif text-xl leading-snug text-[#F5EDE4] sm:text-2xl">Enjoyed your experience? Leave a tip</h2>
        </div>
      </div>
      <div role="group" aria-label="Choose a tip" className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-5 sm:gap-3">
        {offer.choices.map((choice) => {
          const selected = percent === choice.percent || (percent === null && tip === 0 && choice.percent === 0);
          return (
            <motion.button
              key={choice.percent}
              type="button"
              aria-pressed={selected}
              aria-label={choice.percent === 0 ? "No Tip" : `${choice.percent}% tip, ${formatCzk(choice.tip)}`}
              disabled={!offer.enabled}
              onClick={(event) => {
                if (choice.percent > 0 && !reduceMotion && sectionRef.current) {
                  const button = event.currentTarget.getBoundingClientRect();
                  const section = sectionRef.current.getBoundingClientRect();
                  setFeedback({id:++feedbackSequence.current,x:button.left-section.left+button.width/2,y:button.top-section.top+button.height/2});
                } else {
                  setFeedback(null);
                }
                onSelect(choice.percent);
              }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              className={`relative flex min-h-[68px] min-w-0 flex-col items-center justify-center overflow-hidden rounded-2xl border px-2 py-3 outline-none transition-[background-color,border-color,box-shadow,color] duration-300 focus-visible:ring-2 focus-visible:ring-[#E8D5C4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#19191b] disabled:cursor-wait disabled:opacity-50 motion-reduce:transition-none ${choice.percent === 0 ? "col-span-2 min-[380px]:col-span-1" : ""} ${selected ? "border-[#DCC1A5]/80 bg-[#C9A88B]/15 text-[#F4DFC8] shadow-[0_0_18px_-8px_rgba(201,168,139,0.5)]" : "border-white/10 bg-black/15 text-white/65 hover:border-[#C9A88B]/45 hover:bg-[#C9A88B]/5 hover:text-[#F5EDE4]"}`}
            >
              <span className="whitespace-nowrap text-sm font-medium tabular-nums sm:text-lg">{choice.percent === 0 ? "No Tip" : `${choice.percent}%`}</span>
              <span className="mt-1 text-[10px] tabular-nums opacity-65 sm:text-xs">{formatCzk(choice.tip)}</span>
              {selected && <Check className="absolute right-1.5 top-1.5 h-3 w-3 text-[#DCC1A5]" strokeWidth={2} aria-hidden="true" />}
            </motion.button>
          );
        })}
      </div>
      <div aria-live="polite" aria-atomic="true" className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className={error ? "text-amber-200" : "text-white/45"}>
          {error ? "Couldn’t sync with POS. Please try again or ask your server." : pending ? "Updating your bill…" : !offer.enabled ? "Payment in progress" : "Entirely optional. Always appreciated."}
        </span>
        <span className="font-medium tabular-nums text-[#E8D5C4]">Tip · {formatCzk(tip)}</span>
      </div>
    </motion.section>
  );
}
