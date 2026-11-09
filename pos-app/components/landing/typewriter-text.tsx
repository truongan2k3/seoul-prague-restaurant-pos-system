"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./typewriter-text.module.css";

export const SEOUL_HERO_PHRASES = [
  "Welcome to SEOUL PRAGUE.",
  "Experience Authentic Korean BBQ.",
  "A Taste of Korea in Prague.",
  "Fresh Ingredients. Bold Flavors.",
  "Grill. Share. Enjoy.",
  "Where Every Meal Becomes a Memory.",
  "Your Korean BBQ Experience Starts Here.",
] as const;

const TYPING_MS = 70;
const DELETING_MS = 40;
const HOLD_MS = 2200;
const NEXT_PHRASE_MS = 350;

interface TypewriterTextProps {
  sentences?: readonly string[];
}

export function TypewriterText({ sentences = SEOUL_HERO_PHRASES }: TypewriterTextProps) {
  const phrases = useMemo(() => sentences.map(sentence => Array.from(sentence)), [sentences]);
  // Identical server and initial client output; browser preferences are read in the effect.
  const [text, setText] = useState("");
  const [paused, setPaused] = useState(false);
  const playback = useRef<((paused: boolean) => void) | null>(null);

  useEffect(() => {
    if (phrases.length === 0) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    let dueAt = 0;
    let remaining = TYPING_MS;
    let phraseIndex = 0;
    let characterCount = 0;
    let deleting = false;
    let disposed = false;
    let userPaused = false;

    function clearTimer() {
      if (timer === undefined) return;
      window.clearTimeout(timer);
      timer = undefined;
    }

    function schedule(delay: number) {
      remaining = delay;
      if (disposed || userPaused || document.hidden || reducedMotion.matches) return;
      dueAt = performance.now() + delay;
      timer = window.setTimeout(tick, delay);
    }

    function tick() {
      timer = undefined;
      if (disposed) return;
      const phrase = phrases[phraseIndex];
      characterCount = deleting
        ? Math.max(0, characterCount - 1)
        : Math.min(phrase.length, characterCount + 1);
      setText(phrase.slice(0, characterCount).join(""));

      if (!deleting && characterCount === phrase.length) {
        deleting = true;
        schedule(HOLD_MS);
      } else if (deleting && characterCount === 0) {
        deleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
        schedule(NEXT_PHRASE_MS);
      } else {
        schedule(deleting ? DELETING_MS : TYPING_MS);
      }
    }

    function syncPlayback() {
      if (timer !== undefined) remaining = Math.max(0, dueAt - performance.now());
      clearTimer();
      schedule(remaining);
    }

    document.addEventListener("visibilitychange", syncPlayback);
    reducedMotion.addEventListener("change", syncPlayback);
    playback.current = value => {
      userPaused = value;
      syncPlayback();
    };
    schedule(remaining);

    return () => {
      disposed = true;
      playback.current = null;
      clearTimer();
      document.removeEventListener("visibilitychange", syncPlayback);
      reducedMotion.removeEventListener("change", syncPlayback);
    };
  }, [phrases]);

  if (sentences.length === 0) return null;

  return (
    <span className={styles.root}>
      <span className="sr-only">{sentences[0]}</span>
      {/* Every phrase participates in sizing, including its cursor, at every viewport width. */}
      {sentences.map((sentence, index) => (
        <span key={index} aria-hidden="true" className={styles.measure}>
          {sentence}<span className={styles.cursor} />
        </span>
      ))}
      <span aria-hidden="true" className={styles.animated}>
        {text}<span className={`${styles.cursor} ${paused ? "" : styles.blink}`} />
      </span>
      <span aria-hidden="true" className={styles.static}>{sentences[0]}</span>
      <button
        type="button"
        className={styles.playback}
        aria-label={paused ? "Resume animated introduction" : "Pause animated introduction"}
        onClick={() => {
          const next = !paused;
          setPaused(next);
          playback.current?.(next);
        }}
      >
        {paused ? "Resume animation" : "Pause animation"}
      </button>
    </span>
  );
}
