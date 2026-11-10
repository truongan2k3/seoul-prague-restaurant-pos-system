"use client";

import { useCallback, useEffect, useState } from "react";
import { getEetCheckoutContextAction, recoverEetSettlementAction } from "@/src/lib/eet/payment-actions";
import type { EetCheckoutContext, EetPaymentIntent } from "@/src/lib/eet/types";

export function useEetCheckout(tableId: string | undefined, resetKey: number) {
  const [state, setState] = useState<{ tableId?: string; context: EetCheckoutContext | null; error: string | null }>({ context: null, error: null });
  const [recovering, setRecovering] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!tableId) return;
    let current = true;
    void getEetCheckoutContextAction(tableId).then(result => {
      if (current) setState({ tableId, ...result });
    }).catch(() => {
      if (current) setState({ tableId, context: null, error: "EET payment context could not be checked. Reopen checkout." });
    });
    return () => { current = false; };
  }, [tableId, resetKey, refresh]);
  const storageKey = `pos-eet-intent:${tableId}`;

  const prepare = useCallback(async (): Promise<EetPaymentIntent | undefined> => {
    if (!tableId) return undefined;
    if (state.tableId !== tableId || !state.context || state.error) throw new Error(state.error ?? "Checking the active payment context. Please retry.");
    if (!state.context.enabled) return undefined;
    const latest = await getEetCheckoutContextAction(tableId);
    if (latest.error || !latest.context) throw new Error(latest.error ?? "Payment context unavailable.");
    if (latest.context.pendingKey) { setState({ tableId, ...latest }); throw new Error("A payment is already recorded. Recover it without taking payment again."); }
    if (latest.context.visit !== state.context.visit || latest.context.revision !== state.context.revision) throw new Error("The table/payment changed on another device. Reopen checkout.");
    let saved: EetPaymentIntent | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null"); } catch { /* A new intent is safe only for the current server revision. */ }
    if (saved?.expectedVisit === latest.context.visit && saved.expectedRevision === latest.context.revision && typeof saved.key === "string") return saved;
    const intent = { key: crypto.randomUUID(), expectedVisit: latest.context.visit, expectedRevision: latest.context.revision };
    try { sessionStorage.setItem(storageKey, JSON.stringify(intent)); }
    catch { throw new Error("Payment retry protection requires browser session storage. Enable it before paying."); }
    return intent;
  }, [state, tableId, storageKey]);

  const completed = useCallback(() => {
    try { sessionStorage.removeItem(storageKey); } catch { /* Server revision remains authoritative. */ }
    setRefresh(value => value + 1);
  }, [storageKey]);
  const recover = async () => {
    if (!tableId || recovering) return;
    setRecovering(true);
    try { await recoverEetSettlementAction(tableId); completed(); window.location.reload(); }
    catch (error) { setState(previous => ({ ...previous, error: error instanceof Error ? error.message : "Recovery failed; do not take payment again." })); }
    finally { setRecovering(false); }
  };
  const context = state.tableId === tableId ? state.context : null;
  const indicator = state.error ? <span role="status" className="text-xs text-amber-600 dark:text-amber-300">{state.error}</span>
    : context ? <span role="status" className="text-xs text-gray-500 dark:text-gray-400">
      EET · {context.mode === "disabled" ? "Disabled" : context.mode === "playground" ? "Playground (test only)" : "Production"}
      {context.mode !== "disabled" && context.control === "paused" ? " · submissions paused; payments remain queued" : ""}
    </span> : null;
  return { prepare, completed, indicator: <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-1">
    {indicator}
    {context?.pendingKey && <button type="button" disabled={recovering} onClick={() => void recover()} className="text-xs font-semibold text-amber-600 underline dark:text-amber-300">
      {recovering ? "Recovering…" : "Payment recorded — recover without charging"}
    </button>}
  </div> };
}
