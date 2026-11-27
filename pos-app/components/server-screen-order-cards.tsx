"use client";

import { useLayoutEffect, useRef } from "react";
import { Check, Minus, Plus, Smile } from "lucide-react";
import { OverflowPanText } from "@/components/overflow-pan-text";
import {
  formatPreparationMinutes,
  preparationAgeMinutes,
  preparationHighlightTone,
  type PrepHighlightTone,
  type ServerScreenOrderCard,
  type ServerScreenOrderCardLine,
} from "@/lib/server-screen";

const DONE_DOUBLE_TAP_MS = 450;

function cardHeaderClass(
  tone: PrepHighlightTone,
  lingering: boolean,
  queued: boolean,
  hasMessage = false,
): string {
  if (queued) return "bg-amber-300/90 text-zinc-950";
  if (lingering) return "bg-emerald-900/80 text-white";
  if (hasMessage) return "bg-sky-800/90 text-white";
  if (tone === "critical") return "bg-red-800/90 text-white";
  if (tone === "warn") return "bg-orange-700/85 text-white";
  return "bg-gradient-to-r from-[#392631] to-[#2C232D] text-[#F5EDE4]";
}

function selectedCountForLine(
  line: ServerScreenOrderCardLine,
  selectedKeys: Set<string>,
): number {
  if (line.kind === "companion") {
    return line.companionKey && selectedKeys.has(line.companionKey) ? 1 : 0;
  }
  return line.remainingIds.filter((id) => selectedKeys.has(id)).length;
}

function OrderCardLineRow({
  line,
  selectedKeys,
  onToggle,
  onSetCount,
  onUndoDone,
}: {
  line: ServerScreenOrderCardLine;
  selectedKeys: Set<string>;
  onToggle: (line: ServerScreenOrderCardLine) => void;
  onSetCount: (line: ServerScreenOrderCardLine, count: number) => void;
  onUndoDone: (line: ServerScreenOrderCardLine) => void;
}) {
  const remaining = line.remainingIds.length;
  const done = remaining === 0 && (line.doneCount > 0 || line.unitIds.length > 0);
  const selectedCount = selectedCountForLine(line, selectedKeys);
  const selected = selectedCount > 0;
  const canPartial = line.kind === "item" && !line.isSubitem && remaining > 1 && selected;
  const nested = line.kind === "companion" || Boolean(line.isSubitem);
  const isMessage = Boolean(line.isMessage);
  const lastTapRef = useRef(0);

  if (done) {
    return (
      <button
        type="button"
        data-server-interactive
        onClick={() => {
          const now = Date.now();
          if (now - lastTapRef.current <= DONE_DOUBLE_TAP_MS) {
            lastTapRef.current = 0;
            onUndoDone(line);
            return;
          }
          lastTapRef.current = now;
        }}
        className={`w-full px-2.5 py-1.5 text-left opacity-55 transition hover:opacity-80 ${
          isMessage ? "bg-sky-950/30" : ""
        }`}
        title="Double-tap to undo"
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className={`min-w-0 flex-1 text-[1.05rem] font-medium leading-tight text-white/70 line-through decoration-white/35 sm:text-[1.15rem] ${
              nested ? "pl-2 truncate" : isMessage ? "whitespace-pre-wrap break-words" : "truncate"
            }`}
            title={line.name}
          >
            {nested ? <span className="mr-1 opacity-50">↳</span> : null}
            {isMessage ? <span className="mr-1.5 opacity-70">✉</span> : null}
            {line.name}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-emerald-400/90">
            {line.kind === "companion" || isMessage ? null : <span>0</span>}
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </span>
        </div>
        {line.nameZh ? (
          <p
            className={`mt-0.5 text-xs font-medium text-white/40 ${
              nested ? "pl-2 truncate" : isMessage ? "whitespace-pre-wrap break-words" : "truncate"
            }`}
            title={line.nameZh}
          >
            {line.nameZh}
          </p>
        ) : null}
        {line.note ? (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-snug text-white/40">
            {line.note}
          </p>
        ) : null}
      </button>
    );
  }

  return (
    <div
      className={`${
        selected
          ? "bg-amber-300/90 text-zinc-950"
          : isMessage
            ? "bg-sky-500/15 text-[#f5f2ef]"
            : "text-[#f5f2ef]"
      }`}
    >
      <button
        type="button"
        data-server-interactive
        onClick={() => onToggle(line)}
        className="flex w-full min-w-0 items-baseline gap-2 px-2.5 py-1.5 text-left"
      >
        <span className="min-w-0 flex-1 overflow-hidden">
          {isMessage ? (
            <span
              className={`block whitespace-pre-wrap break-words text-[1.1rem] font-bold leading-tight sm:text-[1.25rem] ${
                selected ? "text-zinc-950" : ""
              }`}
              title={line.name}
            >
              <span className={`mr-1.5 ${selected ? "opacity-70" : "opacity-80"}`}>✉</span>
              {line.name}
            </span>
          ) : (
            <span
              className={`flex min-w-0 items-baseline text-[1.1rem] leading-tight sm:text-[1.25rem] ${
                nested ? "pl-2 font-medium" : "font-bold"
              } ${selected ? "text-zinc-950" : ""}`}
              title={line.name}
            >
              {nested ? (
                <span className={`mr-1 shrink-0 ${selected ? "opacity-60" : "opacity-45"}`}>↳</span>
              ) : null}
              <span className="min-w-0 flex-1 overflow-hidden">
                <OverflowPanText text={line.name} respectReducedMotion={false} />
              </span>
            </span>
          )}
          {line.nameZh ? (
            isMessage ? (
              <span
                className={`mt-0.5 block whitespace-pre-wrap break-words text-xs font-semibold tracking-tight sm:text-[0.82rem] ${
                  selected ? "text-zinc-800" : "text-white/70"
                }`}
                title={line.nameZh}
              >
                {line.nameZh}
              </span>
            ) : (
              <span
                className={`mt-0.5 block min-w-0 overflow-hidden text-xs font-semibold tracking-tight sm:text-[0.82rem] ${
                  nested ? "pl-2" : ""
                } ${selected ? "text-zinc-800" : "text-white/70"}`}
                title={line.nameZh}
              >
                <OverflowPanText text={line.nameZh} respectReducedMotion={false} />
              </span>
            )
          ) : null}
        </span>
        <span
          className={`shrink-0 text-right text-base font-bold tabular-nums sm:text-lg ${
            selected ? "text-zinc-950" : isMessage ? "text-sky-200" : "text-[#E8D5C4]"
          }`}
        >
          {line.kind === "companion" || isMessage ? (selected ? "✓" : "–") : remaining}
        </span>
      </button>
      {line.note ? (
        <button
          type="button"
          data-server-interactive
          onClick={() => onToggle(line)}
          className={`w-full px-2.5 pb-1.5 text-left text-xs leading-snug whitespace-pre-wrap break-words ${
            selected ? "text-zinc-800" : "text-white/55"
          } ${nested ? "pl-4" : ""}`}
        >
          {line.note}
        </button>
      ) : null}
      {canPartial ? (
        <div
          data-server-interactive
          className="flex items-center justify-end gap-2 px-2.5 pb-1.5"
        >
          <button
            type="button"
            aria-label="Decrease"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950/15 text-zinc-950 transition hover:bg-zinc-950/25"
            onClick={(event) => {
              event.stopPropagation();
              onSetCount(line, Math.max(1, selectedCount - 1));
            }}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums text-zinc-950">
            {selectedCount}
          </span>
          <button
            type="button"
            aria-label="Increase"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950/15 text-zinc-950 transition hover:bg-zinc-950/25"
            onClick={(event) => {
              event.stopPropagation();
              onSetCount(line, Math.min(remaining, selectedCount + 1));
            }}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OrderCard({
  card,
  nowMs,
  minLabel,
  selectedKeys,
  leaving,
  onToggleLine,
  onSetLineCount,
  onTableTagActivate,
  onUndoDoneLine,
}: {
  card: ServerScreenOrderCard;
  nowMs: number;
  minLabel: string;
  selectedKeys: Set<string>;
  leaving: boolean;
  onToggleLine: (line: ServerScreenOrderCardLine) => void;
  onSetLineCount: (line: ServerScreenOrderCardLine, count: number) => void;
  onTableTagActivate: (card: ServerScreenOrderCard) => void;
  onUndoDoneLine: (line: ServerScreenOrderCardLine) => void;
}) {
  const age = preparationAgeMinutes(card.ageFrom, nowMs);
  const tone = preparationHighlightTone(age);
  const prepLabel = formatPreparationMinutes(card.ageFrom, nowMs, minLabel);
  const lingering = Boolean(card.lingering);
  const remainingKeys: string[] = [];
  for (const line of card.lines) {
    for (const id of line.remainingIds) remainingKeys.push(id);
  }
  const queued =
    !lingering &&
    remainingKeys.length > 0 &&
    remainingKeys.every((id) => selectedKeys.has(id));

  return (
    <article
      data-server-interactive
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-all duration-200 ${
        card.hasMessage ? "border-sky-400/40 bg-[#121214]" : "border-white/10 bg-[#121214]"
      } ${leaving ? "translate-y-1 scale-[0.98] opacity-0" : ""} ${
        lingering ? "ring-1 ring-emerald-500/40" : ""
      } ${queued ? "ring-1 ring-amber-300/70" : ""}`}
    >
      <header
        className={`flex items-start justify-between gap-2 border-b border-white/[0.08] px-3 py-2.5 ${cardHeaderClass(
          tone,
          lingering,
          queued,
          Boolean(card.hasMessage),
        )}`}
      >
        <button
          type="button"
          data-server-interactive
          onClick={() => onTableTagActivate(card)}
          className="min-w-0 flex-1 rounded-lg text-left transition hover:brightness-110"
          title={lingering ? "Double-tap to undo" : "Tap to mark all done"}
        >
          <p className="max-w-full break-words font-serif text-2xl font-semibold leading-none tracking-tight sm:text-[1.65rem]">
            {card.tableLabel}
          </p>
          <p
            className={`mt-1 text-xs tabular-nums ${
              queued
                ? "text-zinc-800/70"
                : lingering || tone !== "normal"
                  ? "text-white/80"
                  : "text-white/45"
            }`}
          >
            #{card.ticketId}
          </p>
        </button>
        <span
          className={`shrink-0 rounded-lg px-2.5 py-1 text-sm sm:text-base font-bold tabular-nums tracking-wide ${
            queued ? "bg-zinc-950/15 text-zinc-950" : "bg-black/25"
          }`}
        >
          {lingering ? "✓" : prepLabel}
        </span>
      </header>

      <div className="divide-y divide-white/[0.06]">
        {card.lines.map((line) => (
          <OrderCardLineRow
            key={line.key}
            line={line}
            selectedKeys={selectedKeys}
            onToggle={onToggleLine}
            onSetCount={onSetLineCount}
            onUndoDone={onUndoDoneLine}
          />
        ))}
      </div>
    </article>
  );
}

export function ServerScreenOrderCards({
  cards,
  nowMs,
  minLabel,
  selectedKeys,
  animatingOut,
  emptyLabel,
  allDoneLabel,
  onToggleLine,
  onSetLineCount,
  onTableTagActivate,
  onUndoDoneLine,
}: {
  cards: ServerScreenOrderCard[];
  nowMs: number;
  minLabel: string;
  selectedKeys: Set<string>;
  animatingOut: Set<string>;
  emptyLabel: string;
  allDoneLabel?: string;
  onToggleLine: (line: ServerScreenOrderCardLine) => void;
  onSetLineCount: (line: ServerScreenOrderCardLine, count: number) => void;
  onTableTagActivate: (card: ServerScreenOrderCard) => void;
  onUndoDoneLine: (line: ServerScreenOrderCardLine) => void;
}) {
  const masonryRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = masonryRef.current;
    if (!container) return;
    // One-pixel rows pack variable-height tickets without changing their DOM order.
    const tickets = Array.from(container.children) as HTMLElement[];
    const measure = (ticket: HTMLElement) => {
      const card = ticket.firstElementChild as HTMLElement | null;
      if (card) ticket.style.gridRowEnd = `span ${Math.ceil(card.offsetHeight) + 12}`;
    };
    tickets.forEach(measure);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver((entries) => {
      for (const entry of entries) {
        const ticket = entry.target.parentElement;
        if (ticket) measure(ticket);
      }
    }) : null;
    tickets.forEach(ticket => {
      if (ticket.firstElementChild) observer?.observe(ticket.firstElementChild);
    });
    const measureAll = () => tickets.forEach(measure);
    window.addEventListener("resize", measureAll);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureAll);
    };
  }, [cards]);

  if (cards.length === 0) {
    return (
      <div className="flex min-h-[42vh] flex-col items-center justify-center px-4 py-12 text-center">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 shadow-[0_0_40px_rgba(16,185,129,0.18)]">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/15 [animation-duration:2.6s]" />
          <Smile className="relative h-10 w-10 motion-safe:animate-bounce [animation-duration:2.4s]" />
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-[#121214] bg-emerald-500 text-zinc-950 shadow">
            <Check className="h-4 w-4 stroke-[3]" />
          </span>
        </div>
        <p className="mt-5 font-serif text-xl font-semibold tracking-tight text-emerald-200 sm:text-2xl">
          {allDoneLabel ?? "All orders completed!"}
        </p>
        <p className="mt-1.5 text-sm text-white/45">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div ref={masonryRef} style={{gridAutoRows:"1px"}} className="grid grid-cols-1 items-start gap-x-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {cards.map((card) => {
        const leaving =
          !card.lingering &&
          card.lines.some(
            (line) =>
              line.remainingIds.some((id) => animatingOut.has(id)) ||
              (line.companionKey ? animatingOut.has(line.companionKey) : false),
          );
        return (
          <div key={card.id} className="min-w-0">
          <OrderCard
            card={card}
            nowMs={nowMs}
            minLabel={minLabel}
            selectedKeys={selectedKeys}
            leaving={leaving}
            onToggleLine={onToggleLine}
            onSetLineCount={onSetLineCount}
            onTableTagActivate={onTableTagActivate}
            onUndoDoneLine={onUndoDoneLine}
          />
          </div>
        );
      })}
    </div>
  );
}
