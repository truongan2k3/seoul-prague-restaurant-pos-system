"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { useSettings } from "@/contexts/settings-context";
import { playCallWaiterSound } from "@/lib/notification-sound";
import {
  type GuestTableRequestAlertPayload,
  subscribeToTableGuestRequests,
} from "@/lib/table-guest-alert";
import type { TableGuestRequestKind } from "@/lib/table-guest";
import type { TranslationKey } from "@/lib/i18n/translations";

const DEDUPE_MS = 8_000;

function kindTranslationKey(kind: TableGuestRequestKind): TranslationKey {
  switch (kind) {
    case "call_staff":
      return "tableQrKindCallStaff";
    case "banchan":
      return "tableQrKindBanchan";
    case "grill_change":
      return "tableQrKindGrill";
    case "payment":
      return "tableQrKindPayment";
  }
}

/** Main POS: popup + sound + toast when a guest sends a request from table QR. */
export function TableGuestRequestListener() {
  const { soundMainEnabled, translate, currentStaffUser } = useApp();
  const { settings } = useSettings();
  const { pushToast } = useNotifications();
  const [alert, setAlert] = useState<GuestTableRequestAlertPayload | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queueRef = useRef<GuestTableRequestAlertPayload[]>([]);
  const alertRef = useRef<GuestTableRequestAlertPayload | null>(null);
  const recentAtRef = useRef<Map<string, number>>(new Map());

  const playAlertSound = useCallback(() => {
    if (!soundMainEnabled) return;
    playCallWaiterSound(settings.soundConfigs.callWaiter);
  }, [soundMainEnabled, settings.soundConfigs.callWaiter]);

  const showNext = useCallback((next: GuestTableRequestAlertPayload | null) => {
    alertRef.current = next;
    setAlert(next);
    setQueuedCount(queueRef.current.length);
    setError(null);
  }, []);

  const dismissAlert = useCallback(() => {
    if (busy) return;
    const next = queueRef.current.shift() ?? null;
    showNext(next);
    if (next) playAlertSound();
  }, [busy, playAlertSound, showNext]);

  const enqueueAlert = useCallback(
    (payload: GuestTableRequestAlertPayload) => {
      const lastAt = recentAtRef.current.get(payload.requestId);
      if (lastAt != null && Date.now() - lastAt < DEDUPE_MS) return;
      recentAtRef.current.set(payload.requestId, Date.now());

      const kindLabel = translate(kindTranslationKey(payload.kind));
      const toastMessage = `🛎️ ${translate("table")} ${payload.tableLabel} · ${kindLabel} — ${payload.summary}`;
      pushToast({
        id: `table-guest-${payload.requestId}`,
        message: toastMessage,
      });

      try {
        navigator.vibrate?.([120, 60, 120]);
      } catch {
        /* ignore */
      }

      if (!alertRef.current) {
        showNext(payload);
        playAlertSound();
        return;
      }
      queueRef.current.push(payload);
      setQueuedCount(queueRef.current.length);
      playAlertSound();
    },
    [playAlertSound, pushToast, showNext, translate],
  );

  const completeAndDismiss = useCallback(async () => {
    if (!alert || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/table-guest/requests/${encodeURIComponent(alert.requestId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "completed",
            completedBy: currentStaffUser?.name ?? currentStaffUser?.id ?? "staff",
          }),
        },
      );
      if (!response.ok) {
        setError(translate("tableQrAlertCompleteFailed"));
        return;
      }
      const next = queueRef.current.shift() ?? null;
      showNext(next);
      if (next) playAlertSound();
    } catch {
      setError(translate("tableQrAlertCompleteFailed"));
    } finally {
      setBusy(false);
    }
  }, [alert, busy, currentStaffUser, playAlertSound, showNext, translate]);

  useEffect(() => {
    return subscribeToTableGuestRequests((payload) => {
      enqueueAlert(payload);
    });
  }, [enqueueAlert]);

  const kindLabel = alert ? translate(kindTranslationKey(alert.kind)) : "";

  return (
    <Modal
      open={alert != null}
      onClose={() => {
        if (!busy) dismissAlert();
      }}
      title={translate("tableQrAlertTitle")}
      size="md"
      zIndexClass="z-[110]"
      footer={
        alert ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => void completeAndDismiss()}
              className="min-h-[52px] flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "…" : translate("tableQrDone")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={dismissAlert}
              className="min-h-[52px] flex-1 rounded-xl border border-gray-200 px-4 py-3 text-base font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              {translate("tableQrAlertOk")}
            </button>
          </div>
        ) : null
      }
    >
      {alert ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            {translate("tableQrAlertHint")}
          </p>
          <dl className="space-y-3 rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-800">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 dark:text-gray-400">{translate("table")}</dt>
              <dd className="text-right text-lg font-bold text-gray-900 dark:text-gray-100">
                {alert.tableLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 dark:text-gray-400">{translate("tableQrAlertType")}</dt>
              <dd className="text-right font-semibold text-gray-900 dark:text-gray-100">
                {kindLabel}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">{translate("tableQrAlertDetail")}</dt>
              <dd className="mt-1 whitespace-pre-wrap font-medium text-gray-900 dark:text-gray-100">
                {alert.summary}
              </dd>
            </div>
          </dl>
          {queuedCount > 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {translate("tableQrAlertQueued").replace("{count}", String(queuedCount))}
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </div>
      ) : null}
    </Modal>
  );
}
