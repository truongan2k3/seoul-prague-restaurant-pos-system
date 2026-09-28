"use client";

import { Check, Minus, Plus } from "lucide-react";
import {
  formatPreparationMinutes,
  preparationAgeMinutes,
  preparationHighlightTone,
  type PrepHighlightTone,
  type ServerScreenOrderCard,
  type ServerScreenOrderCardLine,
} from "@/lib/server-screen";

function cardHeaderClass(tone: PrepHighlightTone): string {
  if (tone === "critical") return "bg-red-800/90 text-white";
  if (tone === "warn") return "bg-orange-700/85 text-white";
  return "bg-[#1c1c1f] text-[#F5EDE4]";
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
}: {
  line: ServerScreenOrderCardLine;
  selectedKeys: Set<string>;
  onToggle: (line: ServerScreenOrderCardLine) => void;
  onSetCount: (line: ServerScreenOrderCardLine, count: number) => void;
}) {
  const remaining = line.remainingIds.length;
  const done = remaining === 0 && line.doneCount > 0;
  const selectedCount = selectedCountForLine(line, selectedKeys);
  const selected = selectedCount > 0;
  const canPartial = line.kind === "item" && remaining > 1 && selected;

  if (done) {
    return (
      <div className="px-2.5 py-1.5 opacity-55">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className={`min-w-0 flex-1 truncate text-[0.95rem] font-medium leading-tight text-white/70 ${
              line.kind === "companion" ? "pl-2" : ""
            }`}
            title={line.name}
          >
            {line.kind === "companion" ? (
              <span className="mr-1 opacity-50">↳</span>
            ) : null}
            {line.name}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-emerald-400/90">
            {line.kind === "companion" ? null : <span>0</span>}
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </span>
        </div>
        {line.note ? (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-snug text-white/40">
            {line.note}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`${selected ? "bg-amber-300/90 text-zinc-950" : "text-[#f5f2ef]"} ${
        line.kind === "companion" ? "" : ""
      }`}
    >
      <button
        type="button"
        data-server-interactive
        onClick={() => onToggle(line)}
        className="flex w-full min-w-0 items-baseline gap-2 px-2.5 py-1.5 text-left"
      >
        <span
          className={`min-w-0 flex-1 truncate text-[0.95rem] font-semibold leading-tight sm:text-[1.05rem] ${
            line.kind === "companion" ? "pl-2 font-medium" : ""
          } ${selected ? "text-zinc-950" : ""}`}
          title={line.name}
        >
          {line.kind === "companion" ? (
            <span className={`mr-1 ${selected ? "opacity-60" : "opacity-45"}`}>↳</span>
          ) : null}
          {line.name}
        </span>
        <span
          className={`shrink-0 text-right text-base font-bold tabular-nums sm:text-lg ${
            selected ? "text-zinc-950" : "text-[#E8D5C4]"
          }`}
        >
          {line.kind === "companion" ? (selected ? "✓" : "–") : remaining}
        </span>
      </button>
      {line.note ? (
        <button
          type="button"
          data-server-interactive
          onClick={() => onToggle(line)}
          className={`w-full px-2.5 pb-1.5 text-left text-xs leading-snug whitespace-pre-wrap break-words ${
            selected ? "text-zinc-800" : "text-white/55"
          } ${line.kind === "companion" ? "pl-4" : ""}`}
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
}: {
  card: ServerScreenOrderCard;
  nowMs: number;
  minLabel: string;
  selectedKeys: Set<string>;
  leaving: boolean;
  onToggleLine: (line: ServerScreenOrderCardLine) => void;
  onSetLineCount: (line: ServerScreenOrderCardLine, count: number) => void;
}) {
  const age = preparationAgeMinutes(card.ageFrom, nowMs);
  const tone = preparationHighlightTone(age);
  const prepLabel = formatPreparationMinutes(card.ageFrom, nowMs, minLabel);

  return (
    <article
      data-server-interactive
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121214] shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-all duration-200 ${
        leaving ? "translate-y-1 scale-[0.98] opacity-0" : ""
      }`}
    >
      <header
        className={`flex items-start justify-between gap-2 px-3 py-2.5 ${cardHeaderClass(tone)}`}
      >
        <div className="min-w-0">
          <p className="font-serif text-2xl font-semibold leading-none tracking-tight sm:text-[1.65rem]">
            {card.tableLabel}
          </p>
          <p
            className={`mt-1 text-xs tabular-nums ${
              tone === "normal" ? "text-white/45" : "text-white/80"
            }`}
          >
            #{card.ticketId}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-black/20 px-2 py-1 text-xs font-semibold tabular-nums tracking-wide">
          {prepLabel}
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
  onToggleLine,
  onSetLineCount,
}: {
  cards: ServerScreenOrderCard[];
  nowMs: number;
  minLabel: string;
  selectedKeys: Set<string>;
  animatingOut: Set<string>;
  emptyLabel: string;
  onToggleLine: (line: ServerScreenOrderCardLine) => void;
  onSetLineCount: (line: ServerScreenOrderCardLine, count: number) => void;
}) {
  if (cards.length === 0) {
    return <p className="px-4 py-10 text-center text-base text-white/35">{emptyLabel}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {cards.map((card) => {
        const leaving = card.lines.some(
          (line) =>
            line.remainingIds.some((id) => animatingOut.has(id)) ||
            (line.companionKey ? animatingOut.has(line.companionKey) : false),
        );
        return (
          <OrderCard
            key={card.id}
            card={card}
            nowMs={nowMs}
            minLabel={minLabel}
            selectedKeys={selectedKeys}
            leaving={leaving}
            onToggleLine={onToggleLine}
            onSetLineCount={onSetLineCount}
          />
        );
      })}
    </div>
  );
}
