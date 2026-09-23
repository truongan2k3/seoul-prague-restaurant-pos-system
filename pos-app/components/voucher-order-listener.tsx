"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { useSettings } from "@/contexts/settings-context";
import { playCallWaiterSound } from "@/lib/notification-sound";
import { formatVoucherAmount } from "@/lib/voucher";
import {
  subscribeToVoucherOrderAlerts,
  type VoucherOrderAlertPayload,
} from "@/lib/voucher-order-alert";

const seenOrderIds = new Set<string>();

interface VoucherOrderListenerProps {
  onOpenOrder?: (orderUuid: string) => void;
}

/** POS popup + toast when a guest places a voucher order. */
export function VoucherOrderListener({ onOpenOrder }: VoucherOrderListenerProps) {
  const { soundMainEnabled, translate } = useApp();
  const { settings } = useSettings();
  const { pushToast } = useNotifications();
  const [alert, setAlert] = useState<VoucherOrderAlertPayload | null>(null);
  const alertRef = useRef<VoucherOrderAlertPayload | null>(null);

  const playAlertSound = useCallback(() => {
    if (!soundMainEnabled) return;
    const url =
      settings.soundConfigs.callWaiter || settings.soundConfigs.newOrder;
    playCallWaiterSound(url);
  }, [soundMainEnabled, settings.soundConfigs.callWaiter, settings.soundConfigs.newOrder]);

  const dismiss = useCallback(() => {
    alertRef.current = null;
    setAlert(null);
  }, []);

  useEffect(() => {
    return subscribeToVoucherOrderAlerts((payload) => {
      if (seenOrderIds.has(payload.orderId)) return;
      seenOrderIds.add(payload.orderId);

      const message = `${translate("voucherOrderAlertTitle")}: ${payload.orderId} · ${formatVoucherAmount(payload.totalCzk)} · ${payload.buyerName || payload.buyerEmail}`;
      pushToast({
        id: `voucher-order-${payload.orderId}`,
        message,
      });

      try {
        navigator.vibrate?.([100, 40, 100]);
      } catch {
        /* ignore */
      }

      playAlertSound();
      alertRef.current = payload;
      setAlert(payload);
    });
  }, [playAlertSound, pushToast, translate]);

  return (
    <Modal
      open={alert != null}
      onClose={dismiss}
      title={translate("voucherOrderAlertTitle")}
      zIndexClass="z-[110]"
    >
      {alert ? (
        <div className="space-y-4">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">{translate("voucherOrderId")}</dt>
              <dd className="font-semibold tabular-nums">{alert.orderId}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">{translate("voucherCustomer")}</dt>
              <dd className="text-right">
                {alert.buyerName || "—"}
                <br />
                <span className="text-xs text-gray-500">{alert.buyerEmail}</span>
                {alert.buyerPhone ? (
                  <>
                    <br />
                    <span className="text-xs text-gray-500">{alert.buyerPhone}</span>
                  </>
                ) : null}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">{translate("voucherAmount")}</dt>
              <dd className="font-semibold">
                {formatVoucherAmount(alert.denominationCzk)} × {alert.quantity} ={" "}
                {formatVoucherAmount(alert.totalCzk)}
              </dd>
            </div>
          </dl>
          <div className="flex flex-col gap-2 sm:flex-row">
            {onOpenOrder ? (
              <button
                type="button"
                onClick={() => {
                  const id = alert.orderUuid;
                  dismiss();
                  onOpenOrder(id);
                }}
                className="flex-1 rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
              >
                {translate("voucherOrderAlertOk")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-semibold dark:border-gray-600"
            >
              {translate("voucherCancel")}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
