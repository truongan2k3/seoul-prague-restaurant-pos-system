"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import styles from "./slide-to-send-order.module.css";

const CONFIRM_THRESHOLD = 0.5;

type Gesture = {
  pointerId: number;
  startX: number;
  travel: number;
  contextId: string;
  handle: HTMLButtonElement;
};

interface SlideToSendOrderProps {
  contextId: string;
  disabled: boolean;
  onSend: (contextId: string) => Promise<boolean>;
  errorMessage?: string | null;
}

/** Sends only on a completed drag-release or two separate keyboard confirmations. */
export function SlideToSendOrder({ contextId, disabled, onSend, errorMessage }: SlideToSendOrderProps) {
  const instructionsId = useId();
  const track = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const locked = useRef(false);
  const mounted = useRef(false);
  const armed = useRef(false);
  const heldKey = useRef<string | null>(null);
  const latest = useRef({ contextId, disabled, onSend });
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [keyboardArmed, setKeyboardArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showProgress = useCallback((progress: number, mode: "drag" | "reset" | "complete") => {
    const element = track.current;
    if (!element) return;
    element.dataset.motion = mode;
    element.style.setProperty("--swipe-progress", String(progress));
    element.dataset.ready = String(progress >= CONFIRM_THRESHOLD);
  }, []);

  const releaseGesture = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    try {
      if (current?.handle.hasPointerCapture(current.pointerId)) {
        current.handle.releasePointerCapture(current.pointerId);
      }
    } catch {
      // The browser may already have cancelled this pointer while the table unmounted.
    }
  }, []);

  const cancel = useCallback(() => {
    releaseGesture();
    armed.current = false;
    heldKey.current = null;
    setKeyboardArmed(false);
    if (!locked.current) showProgress(0, "reset");
  }, [releaseGesture, showProgress]);

  useLayoutEffect(() => {
    const contextChanged = latest.current.contextId !== contextId;
    latest.current = { contextId, disabled, onSend };
    if (disabled || contextChanged) {
      if (gesture.current || armed.current) cancel();
    }
  }, [contextId, disabled, onSend, cancel]);

  useLayoutEffect(() => {
    mounted.current = true;
    const cancelInteraction = () => {
      if (gesture.current || armed.current) cancel();
    };
    const onVisibility = () => { if (document.hidden) cancelInteraction(); };
    window.addEventListener("blur", cancelInteraction);
    window.addEventListener("resize", cancelInteraction);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted.current = false;
      releaseGesture();
      window.removeEventListener("blur", cancelInteraction);
      window.removeEventListener("resize", cancelInteraction);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cancel, releaseGesture]);

  async function confirm(expectedContextId: string) {
    const current = latest.current;
    if (!mounted.current || locked.current || current.disabled || !expectedContextId
      || current.contextId !== expectedContextId) {
      cancel();
      return;
    }
    // Lock synchronously, before any state render or asynchronous order preparation.
    locked.current = true;
    armed.current = false;
    setKeyboardArmed(false);
    setError(null);
    setPhase("sending");
    showProgress(1, "complete");
    try {
      // Completion animates in parallel; no delay is added before sending.
      const sent = await current.onSend(expectedContextId);
      if (!mounted.current || latest.current.contextId !== expectedContextId) return;
      if (!sent) throw new Error("Order not sent. Check the order and try again.");
      setPhase("sent");
      // Stay locked until the existing workflow closes/reopens this keyed control.
    } catch (failure) {
      if (!mounted.current || latest.current.contextId !== expectedContextId) return;
      locked.current = false;
      setPhase("idle");
      setError(failure instanceof Error ? failure.message : "Could not send order. Please retry.");
      showProgress(0, "reset");
    }
  }

  function start(event: PointerEvent<HTMLButtonElement>) {
    const current = latest.current;
    if (!event.isPrimary || event.button !== 0 || current.disabled || locked.current || gesture.current) return;
    const element = track.current;
    if (!element || !current.contextId) return;
    const travel = element.clientWidth - event.currentTarget.offsetWidth - 8;
    if (travel <= 0) return;
    event.preventDefault();
    cancel();
    setError(null);
    event.currentTarget.focus({ preventScroll: true });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    gesture.current = {
      pointerId: event.pointerId, startX: event.clientX, travel,
      contextId: current.contextId, handle: event.currentTarget,
    };
    showProgress(0, "drag");
  }

  function progress(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return null;
    const current = latest.current;
    const travel = (track.current?.clientWidth ?? 0) - active.handle.offsetWidth - 8;
    if (current.disabled || current.contextId !== active.contextId || Math.abs(travel - active.travel) > 1) {
      cancel();
      return null;
    }
    return Math.max(0, Math.min(1, (event.clientX - active.startX) / active.travel));
  }

  const label = phase === "sending" ? "Sending Order..."
    : phase === "sent" ? "Order Sent ✓"
      : keyboardArmed ? "Press Enter or Space again to send"
        : "Slide to Send Order →";

  return (
    <div className={styles.root}>
      <div ref={track} className={styles.track} data-disabled={disabled && phase === "idle"} aria-busy={phase === "sending"}>
        <div aria-hidden="true" className={styles.fill} />
        <span aria-live="polite" className={styles.label}>{label}</span>
        <button
          type="button"
          className={styles.handle}
          disabled={disabled || phase !== "idle" || !contextId}
          aria-label={keyboardArmed ? "Confirm sending order" : "Slide to Send Order"}
          aria-describedby={instructionsId}
          onClick={event => event.preventDefault()}
          onPointerDown={start}
          onPointerMove={event => {
            const value = progress(event);
            if (value !== null) {
              event.preventDefault();
              showProgress(value, "drag");
            }
          }}
          onPointerUp={event => {
            const value = progress(event);
            const active = gesture.current;
            if (value === null || !active) return;
            event.preventDefault();
            releaseGesture();
            if (value >= CONFIRM_THRESHOLD) void confirm(active.contextId);
            else cancel();
          }}
          onPointerCancel={event => { if (gesture.current?.pointerId === event.pointerId) cancel(); }}
          onLostPointerCapture={event => { if (gesture.current?.pointerId === event.pointerId) cancel(); }}
          onBlur={cancel}
          onKeyDown={event => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              cancel();
              return;
            }
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat || heldKey.current || latest.current.disabled || locked.current) return;
            heldKey.current = event.key;
            if (armed.current) void confirm(latest.current.contextId);
            else {
              armed.current = true;
              setKeyboardArmed(true);
              setError(null);
            }
          }}
          onKeyUp={event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              heldKey.current = null;
            }
          }}
        >
          {phase === "sending" ? <LoaderCircle aria-hidden="true" className={styles.spinner} />
            : phase === "sent" ? <Check aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
        </button>
      </div>
      <span id={instructionsId} className="sr-only">
        Drag the arrow right at least {CONFIRM_THRESHOLD * 100}% and release to send. A tap does not send.
        With a keyboard, press and release Enter or Space, then press again to confirm.
        Press Escape or leave the control to cancel.
      </span>
      {error && <p role="alert" className={`${styles.error} text-red-600 dark:text-red-300`}>{errorMessage || error}</p>}
    </div>
  );
}
