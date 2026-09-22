"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { useSettings } from "@/contexts/settings-context";
import { playCallWaiterSound } from "@/lib/notification-sound";
import {
  subscribeToGuestChatAlerts,
  type GuestChatAlertPayload,
} from "@/lib/guest-chat-alert";

const DEDUPE_MS = 8_000;

/** POS popup + sound when a guest sends a Chat With Us message. */
export function GuestChatListener() {
  const { soundMainEnabled, translate } = useApp();
  const { settings } = useSettings();
  const { pushToast } = useNotifications();
  const [alert, setAlert] = useState<GuestChatAlertPayload | null>(null);
  const alertRef = useRef<GuestChatAlertPayload | null>(null);
  const recentAtRef = useRef<Map<string, number>>(new Map());

  const playAlertSound = useCallback(() => {
    if (!soundMainEnabled) return;
    const url =
      settings.soundConfigs.guestChat ||
      settings.soundConfigs.callWaiter ||
      settings.soundConfigs.newOrder;
    playCallWaiterSound(url);
  }, [
    soundMainEnabled,
    settings.soundConfigs.guestChat,
    settings.soundConfigs.callWaiter,
    settings.soundConfigs.newOrder,
  ]);

  const dismiss = useCallback(() => {
    alertRef.current = null;
    setAlert(null);
  }, []);

  useEffect(() => {
    return subscribeToGuestChatAlerts((payload) => {
      if (payload.kind !== "new_message" && payload.kind !== "follow_up") return;
      const key = `${payload.kind}:${payload.sessionId}:${payload.preview ?? ""}`;
      const last = recentAtRef.current.get(key);
      if (last != null && Date.now() - last < DEDUPE_MS) return;
      recentAtRef.current.set(key, Date.now());

      const title =
        payload.kind === "follow_up"
          ? translate("guestChatFollowUpAlert")
          : translate("guestChatNewAlert");
      const body = payload.preview || translate("guestChatNewAlertBody");

      pushToast({
        id: `guest-chat-${payload.sessionId}-${Date.now()}`,
        message: `${title}: ${body}`,
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
      title={
        alert?.kind === "follow_up"
          ? translate("guestChatFollowUpAlert")
          : translate("guestChatNewAlert")
      }
      zIndexClass="z-[110]"
    >
      {alert ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {alert.preview || translate("guestChatNewAlertBody")}
          </p>
          <p className="text-xs text-gray-500">
            {translate("guestChatOpenInboxHint")}
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
          >
            {translate("guestChatAlertOk")}
          </button>
        </div>
      ) : null}
    </Modal>
  );
}
