"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, Minus, Plus, Undo2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { formatCzk } from "@/lib/currency";
import type { RestaurantTable } from "@/lib/types";
import type { ItemTransferHistory, ItemTransferReason, TransferableItem } from "@/lib/item-transfers";
import { getItemTransferContextAction, transferOrderItemsAction } from "@/src/lib/item-transfer-actions";

export function ItemTransferModal({ table, tables, onClose, onChanged, revision }: {
  table: RestaurantTable; tables: RestaurantTable[]; onClose: () => void; onChanged: () => void; revision: string;
}) {
  const { translate: t, language } = useApp();
  const [items, setItems] = useState<TransferableItem[]>([]);
  const [history, setHistory] = useState<ItemTransferHistory[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState<ItemTransferReason>("wrong_table");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(false);
  const [undo, setUndo] = useState<ItemTransferHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const locked = useRef(false);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const data = await getItemTransferContextAction(table.id);
      if (current !== sequence.current) return;
      setItems(data.items); setHistory(data.history); setError(data.error);
      // Keep the snapshot used for preview until staff explicitly reloads or starts a new selection.
    } catch (cause) { if (current === sequence.current) setError(cause instanceof Error ? cause.message : "Connection interrupted. Retry safely."); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [table.id]);
  useEffect(() => () => { sequence.current++; }, []);
  useEffect(() => {
    if (!locked.current) { setPreview(false); setQuantities({}); void refresh(); }
  }, [refresh, revision]);
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!locked.current) onClose();
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [onClose]);
  const selection = items.filter(item => (quantities[item.id] ?? 0) > 0);
  const total = selection.reduce((sum, item) => sum + item.price * quantities[item.id], 0);
  const dest = tables.find(candidate => candidate.id === destination);
  const button = "min-h-11 rounded-lg border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5 disabled:opacity-40";
  const primary = `${button} border-[#C9A88B]/60 bg-[#C9A88B] font-semibold text-[#141416] hover:bg-[#DFC4AB]`;
  const changeQuantity = (item: TransferableItem, quantity: number) => {
    setQuantities(previous => ({ ...previous, [item.id]: Math.max(0, Math.min(item.quantity, quantity)) }));
    setPreview(false); setSuccess(null); request.current = null;
  };
  const confirm = async () => {
    if (locked.current || (!undo && (!selection.length || !dest))) return;
    locked.current = true; setBusy(true); setError(null); setSuccess(null);
    const input = undo ? {
      sourceId: undo.destination_table_id, destinationId: undo.source_table_id, items: [], reason: undo.reason, note: undo.note, undoId: undo.id,
    } : {
      sourceId: table.id, destinationId: destination, items: selection.map(item => ({ id: item.id, quantity: quantities[item.id], expected: item.expected })), reason, note,
    };
    const payload = JSON.stringify(input);
    const requestId = request.current?.payload === payload ? request.current.id : crypto.randomUUID();
    request.current = { payload, id: requestId };
    try {
      const result = await transferOrderItemsAction({ ...input, requestId });
      if (result.error) { setError(result.error); return; }
      setSuccess(t(undo ? "transferUndoSuccess" : "transferSuccess"));
      setPreview(false); setUndo(null); setQuantities({}); request.current = null;
      onChanged(); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection interrupted. Retry uses the same transfer ID."); }
    finally { locked.current = false; setBusy(false); }
  };
  return <Modal open onClose={() => { if (!locked.current) onClose(); }} title={t("transferItems")} size="lg" zIndexClass="z-[100]"
    footer={<div className="flex flex-wrap justify-end gap-2">
      <button type="button" className={button} disabled={busy} onClick={() => { if (preview || undo) { setPreview(false); setUndo(null); } else onClose(); }}>{t("cancel")}</button>
      {(preview || undo) ? <button type="button" className={primary} disabled={busy || loading || (!undo && (!selection.length || !dest))} onClick={() => void confirm()}>
        {busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}{t(undo ? "transferUndoConfirm" : "transferConfirm")}
      </button> : <button type="button" className={primary} disabled={busy || loading || !selection.length || !dest} onClick={() => { setPreview(true); setError(null); }}>{t("transferPreview")}</button>}
    </div>}>
    <div className="space-y-4 text-[#F5F2EF]">
      {error && <div role="alert" className="rounded-lg border border-red-400/30 bg-red-950/40 p-3 text-sm text-red-200">{error}
        <button type="button" className="ml-2 underline underline-offset-4" disabled={busy} onClick={() => { setPreview(false); setUndo(null); setQuantities({}); request.current=null; void refresh(); }}>{t("transferRetry")}</button></div>}
      {success && <p role="status" className="rounded-lg bg-emerald-950/50 p-3 text-sm text-emerald-200"><Check className="mr-2 inline h-4 w-4" />{success}</p>}
      <div className="rounded-xl border border-[#C9A88B]/25 bg-[#C9A88B]/5 p-4">
        <div className="flex items-center justify-center gap-5 text-2xl font-semibold"><span>{undo?.destination_label ?? table.label}</span><ArrowRight className="h-5 w-5 text-[#C9A88B]" /><span>{undo?.source_label ?? dest?.label ?? "—"}</span></div>
        <p className="mt-3 text-center text-xs text-[#C9A88B]">{t("transferNoPrint")}</p>
      </div>
      {undo ? <div className="space-y-2">{undo.items.map(line => <p key={line.movedId} className="flex justify-between text-sm"><span>{line.before.name}</span><span>×{line.quantity}</span></p>)}<p className="border-t border-white/10 pt-3 text-right text-[#C9A88B]">{formatCzk(undo.amount)}</p></div> : preview ? <div className="space-y-3">
        {selection.map(item => <div key={item.id} className="flex justify-between gap-3 text-sm"><span>{item.name} ×{quantities[item.id]}</span><span>{formatCzk(item.price * quantities[item.id])}</span></div>)}
        <div className="flex justify-between border-t border-white/10 pt-3 font-semibold"><span>{table.label}: −{formatCzk(total)}</span><span>{dest?.label}: +{formatCzk(total)}</span></div>
        <p className="text-xs text-white/60">{t(reason === "wrong_table" ? "transferWrongTable" : reason === "customer_moved" ? "transferCustomerMoved" : reason === "split_group" ? "transferSplitGroup" : "transferOther")}{note ? ` · ${note}` : ""}</p>
      </div> : <>
        <div className="flex items-center justify-between gap-2 text-sm"><span className="text-white/50">{t("table")} {table.label}</span>
          <button type="button" className="min-h-11 text-[#C9A88B]" disabled={loading || busy || !items.length} onClick={() => { const all = items.every(item => quantities[item.id] === item.quantity); setQuantities(Object.fromEntries(items.map(item => [item.id, all ? 0 : item.quantity]))); setSuccess(null); request.current = null; }}>{t("transferSelectAll")}</button></div>
        {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#C9A88B]" /> : items.length === 0 ? <p className="py-4 text-center text-sm text-white/50">{t("transferNoItems")}</p> : <div className="max-h-[32vh] space-y-2 overflow-y-auto">
          {items.map(item => { const quantity=quantities[item.id] ?? 0; return <div key={item.id} className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${quantity ? "border-[#C9A88B]/50 bg-[#C9A88B]/10" : "border-white/10"}`}>
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3"><input type="checkbox" checked={quantity > 0} disabled={busy} onChange={() => changeQuantity(item, quantity ? 0 : item.quantity)} className="mt-1 h-5 w-5 shrink-0 accent-[#C9A88B]" /><span className="min-w-0 text-sm"><span className="block font-medium">{item.name}</span><span className="mt-1 block text-xs text-white/50">{formatCzk(item.price)} · {item.status}{item.notes ? ` · ${item.notes}` : ""}</span></span></label>
            <div className="flex shrink-0 items-center gap-2"><button type="button" aria-label={t("transferLess")} className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/5 disabled:opacity-25" disabled={!quantity || busy} onClick={() => changeQuantity(item, quantity-1)}><Minus className="h-4 w-4" /></button><output className="min-w-9 text-center text-sm tabular-nums">{quantity}/{item.quantity}</output><button type="button" aria-label={t("transferMore")} className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/5 disabled:opacity-25" disabled={quantity >= item.quantity || busy} onClick={() => changeQuantity(item, quantity+1)}><Plus className="h-4 w-4" /></button></div>
          </div>; })}
        </div>}
        <label className="block text-xs text-[#C9A88B]">{t("transferDestination")}<select value={destination} disabled={busy} onChange={event => { setDestination(event.target.value); request.current=null; }} className="mt-2 min-h-12 w-full rounded-lg border border-white/15 bg-[#1A1A1C] px-3 text-base text-white"><option value="">—</option>{tables.filter(candidate => candidate.id !== table.id && candidate.paymentStatus !== "paid").map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label} · {t(candidate.status === "empty" ? "available" : "order")}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs text-[#C9A88B]">{t("transferReason")}<select value={reason} onChange={event => { setReason(event.target.value as ItemTransferReason); request.current=null; }} className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-[#1A1A1C] px-3 text-sm text-white">
          <option value="wrong_table">{t("transferWrongTable")}</option><option value="customer_moved">{t("transferCustomerMoved")}</option><option value="split_group">{t("transferSplitGroup")}</option><option value="other">{t("transferOther")}</option></select></label><label className="block text-xs text-[#C9A88B]">{t("transferNote")}<input value={note} maxLength={1000} onChange={event => { setNote(event.target.value); request.current=null; }} className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-[#1A1A1C] px-3 text-sm text-white" /></label></div>
      </>}
      <p className="text-xs leading-relaxed text-white/45">{t("transferBenefitsStay")}</p>
      {!preview && !undo && <details className="border-t border-white/10 pt-3"><summary className="min-h-11 cursor-pointer text-sm text-[#C9A88B]">{t("transferHistory")} · {history.length}</summary>
        <div className="space-y-3">{!history.length && <p className="text-xs text-white/40">{t("transferNoHistory")}</p>}{history.map(entry => <div key={entry.id} className="rounded-lg border border-white/10 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>{entry.source_label} → {entry.destination_label} · {formatCzk(entry.amount)}</strong><span className="text-white/45">{new Date(entry.created_at).toLocaleString(language === "cs" ? "cs-CZ" : language === "vi" ? "vi-VN" : "en-GB", { timeZone: "Europe/Prague", hour12: false })}</span></div>
          <p className="mt-1 text-white/65">{entry.items.map(line => `${line.before.name} ×${line.quantity}`).join(" · ")}</p><p className="mt-1 text-white/40">{entry.actor_name} · {t(entry.reason === "wrong_table" ? "transferWrongTable" : entry.reason === "customer_moved" ? "transferCustomerMoved" : entry.reason === "split_group" ? "transferSplitGroup" : "transferOther")}{entry.note ? ` · ${entry.note}` : ""}</p>
          <p className="mt-1 break-all text-[10px] text-white/30">{entry.id}{entry.reversal_of ? ` ↩ ${entry.reversal_of}` : ""}</p>
          {entry.event_kind === "TRANSFER_ORDER_ITEM" && !entry.reversed ? <button type="button" disabled={busy || loading} className="mt-2 inline-flex min-h-11 items-center gap-2 text-[#C9A88B]" onClick={() => { setUndo(entry); setSuccess(null); request.current=null; }}><Undo2 className="h-3.5 w-3.5" />{t("transferUndo")}</button> : <p className="mt-2 text-emerald-300/70">{t("transferUndone")}</p>}
        </div>)}</div>
      </details>}
    </div>
  </Modal>;
}
