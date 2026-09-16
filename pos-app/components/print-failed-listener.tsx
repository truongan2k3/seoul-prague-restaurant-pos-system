"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { playCancelAlertSound } from "@/lib/notification-sound";
import {
  subscribeToPrintFailedAlerts,
  type PrintFailedAlertPayload,
} from "@/lib/print-failed-alert";
import { clearPrintStationAck } from "@/lib/print-station-ack";
import {
  POS_NOTIFICATIONS_CHANNEL,
  type PrintFailedPayload,
  type PrintOkPayload,
} from "@/lib/pos-notifications";
import { supabase } from "@/src/lib/supabase";

const DEDUPE_MS = 8_000;

/** Main POS: blocking modal + sound when kitchen print fails (Print Station or direct). */
export function PrintFailedListener() {
  const { soundMainEnabled, translate } = useApp();
  const { pushNotification } = useNotifications();
  const [alert, setAlert] = useState<PrintFailedAlertPayload | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const queueRef = useRef<PrintFailedAlertPayload[]>([]);
  const alertRef = useRef<PrintFailedAlertPayload | null>(null);
  const recentAtRef = useRef<Map<string, number>>(new Map());

  const playAlertSound = useCallback(() => {
    if (!soundMainEnabled) return;
    playCancelAlertSound();
  }, [soundMainEnabled]);

  const showNext = useCallback((next: PrintFailedAlertPayload | null) => {
    alertRef.current = next;
    setAlert(next);
    setQueuedCount(queueRef.current.length);
  }, []);

  const dismissAlert = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    showNext(next);
    if (next) playAlertSound();
  }, [playAlertSound, showNext]);

  const enqueueAlert = useCallback(
    (payload: PrintFailedAlertPayload) => {
      const lastAt = recentAtRef.current.get(payload.id);
      if (lastAt != null && Date.now() - lastAt < DEDUPE_MS) return;
      recentAtRef.current.set(payload.id, Date.now());

      const tablePart = payload.tableLabel
        ? ` · ${translate("table")} ${payload.tableLabel}`
        : "";
      const hint =
        payload.source === "station-offline"
          ? translate("printStationOfflineHint")
          : payload.source === "station"
            ? translate("printFailedToastHint")
            : translate("printFailedDirectHint");
      pushNotification({
        id: `print-failed-${payload.id}`,
        message: `🖨️ ${translate("printFailedToast")}${tablePart} — ${hint}`,
        playSound: false,
        variant: "error",
      });

      try {
        navigator.vibrate?.([180, 80, 180]);
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
    [playAlertSound, pushNotification, showNext, translate],
  );

  useEffect(() => {
    const unsubLocal = subscribeToPrintFailedAlerts(enqueueAlert);
    // Must use the same channel topic Print Station sends on.
    const channel = supabase
      .channel(POS_NOTIFICATIONS_CHANNEL)
      .on("broadcast", { event: "print_failed" }, ({ payload }) => {
        const data = payload as PrintFailedPayload;
        clearPrintStationAck(data.tableId);
        enqueueAlert({
          id: data.pendingId,
          tableLabel: data.tableLabel,
          detail: data.detail,
          source: "station",
        });
      })
      .on("broadcast", { event: "print_ok" }, ({ payload }) => {
        clearPrintStationAck((payload as PrintOkPayload).tableId);
      })
      .subscribe();
    return () => {
      unsubLocal();
      void supabase.removeChannel(channel);
    };
  }, [enqueueAlert]);

  const hint =
    alert?.source === "station-offline"
      ? translate("printStationOfflineHint")
      : alert?.source === "station"
        ? translate("printFailedToastHint")
        : translate("printFailedDirectHint");

  return (
    <Modal
      open={alert != null}
      onClose={dismissAlert}
      title={translate("printFailedAlertTitle")}
      size="md"
      zIndexClass="z-[110]"
      footer={
        alert ? (
          <button
            type="button"
            onClick={dismissAlert}
            className="min-h-[52px] w-full rounded-xl bg-red-600 px-4 py-3 text-base font-bold text-white hover:bg-red-700"
          >
            {translate("printFailedAlertOk")}
          </button>
        ) : null
      }
    >
      {alert ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 dark:bg-red-950/50 dark:text-red-200">
            {hint}
          </p>
          <dl className="space-y-3 rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-800">
            {alert.tableLabel ? (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">{translate("table")}</dt>
                <dd className="text-right text-lg font-bold text-gray-900 dark:text-gray-100">
                  {alert.tableLabel}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-gray-500 dark:text-gray-400">
                {translate("printFailedAlertDetail")}
              </dt>
              <dd className="mt-1 whitespace-pre-wrap font-medium text-gray-900 dark:text-gray-100">
                {alert.detail}
              </dd>
            </div>
          </dl>
          {queuedCount > 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {translate("printFailedAlertQueued").replace("{count}", String(queuedCount))}
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
