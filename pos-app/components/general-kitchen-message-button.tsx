"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Modal } from "@/components/modal";
import { NoteTranslationSource } from "@/components/note-translation-source";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { useReceiptPrint } from "@/contexts/receipt-print-context";
import { useSettings } from "@/contexts/settings-context";
import { shouldPrintKitchenOnSend } from "@/lib/kitchen-fulfillment-mode";
import { translateNoteToChineseWithSourceAction } from "@/src/lib/translate-actions";
import type { NoteTranslationResult } from "@/src/lib/translator";

function GeneralKitchenMessageDialog({ onClose }: { onClose: () => void }) {
  const { translate } = useApp();
  const { settings } = useSettings();
  const { printKitchenStaffMessage } = useReceiptPrint();
  const { pushNotification } = useNotifications();
  const [draft, setDraft] = useState("");
  const [translateEnabled, setTranslateEnabled] = useState(false);
  const [preview, setPreview] = useState<{ input: string; result: NoteTranslationResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const input = draft.trim();
  const currentPreview = preview?.input === input ? preview.result : undefined;

  useEffect(() => {
    if (!input || !translateEnabled) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void translateNoteToChineseWithSourceAction(input).catch((): NoteTranslationResult => ({
        text: input, provider: "unavailable", cached: false,
      })).then(result => {
        if (!cancelled) setPreview({ input, result });
      });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [input, translateEnabled]);

  const close = () => { if (!lock.current) onClose(); };
  const send = async () => {
    if (!input || lock.current) return;
    if (!shouldPrintKitchenOnSend(settings)) {
      setError(translate("kitchenPrintDisabled"));
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const messageZh = translateEnabled
        ? (currentPreview ?? await translateNoteToChineseWithSourceAction(input)).text
        : input;
      // Same general-message printing path, deliberately without a table identifier.
      await printKitchenStaffMessage({ message: input, messageZh });
      pushNotification({
        message: `${translate("kitchenMessageGeneral")} ✓`,
        variant: "success", playSound: false, durationMs: 2200,
      });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Print failed");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={close} title={translate("kitchenGeneralMessageTitle")} zIndexClass="z-[60]">
      <p className="mb-3 text-xs text-[var(--muted)]">{translate("kitchenGeneralMessageHint")}</p>
      <textarea
        aria-label={translate("kitchenGeneralMessageTitle")}
        autoFocus
        rows={4}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        disabled={busy}
        placeholder={translate("kitchenMessagePlaceholder")}
        className="min-h-[120px] w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-base text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-60"
      />
      {input && <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] px-4 py-3">
        <input type="checkbox" checked={translateEnabled} disabled={busy}
          onChange={event => setTranslateEnabled(event.target.checked)} className="h-5 w-5 rounded border-gray-300" />
        <span className="text-sm">{translate("translateToChinese")}</span>
      </label>}
      {translateEnabled && input && <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900 dark:bg-orange-950/40">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
          {translate("kitchenMessagePreview")}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm font-bold text-orange-700 dark:text-orange-300">
          {currentPreview ? currentPreview.text : translate("noteTranslating")}
        </p>
        <NoteTranslationSource result={currentPreview} pending={!currentPreview} />
      </div>}
      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={close}
          className="min-h-12 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-semibold disabled:opacity-40">
          {translate("cancel")}
        </button>
        <button type="button" disabled={busy || !input} onClick={() => void send()}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-500 disabled:opacity-40">
          <Send className="h-4 w-4 shrink-0" aria-hidden />
          {busy ? translate(translateEnabled ? "kitchenMessageSending" : "kitchenMessagePrinting")
            : translate("kitchenMessageSendNow")}
        </button>
      </div>
    </Modal>
  );
}

/** Shared header action for Floor map and Server; works without selecting a table. */
export function GeneralKitchenMessageButton({ compact = false }: { compact?: boolean }) {
  const { translate } = useApp();
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}
      title={translate("kitchenMessageGeneral")} aria-label={translate("kitchenMessageGeneral")}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-2.5 py-2 text-xs font-semibold text-orange-800 transition-colors hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200 dark:hover:bg-orange-900/50 sm:px-3 sm:text-sm">
      <MessageSquare className="h-4 w-4 shrink-0" aria-hidden />
      <span className={compact ? "hidden xl:inline" : "hidden sm:inline"}>{translate("kitchenMessageGeneral")}</span>
    </button>
    {open && <GeneralKitchenMessageDialog onClose={() => setOpen(false)} />}
  </>;
}
