"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeToGuestChatAlerts } from "@/lib/guest-chat-alert";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";

/** Unread Guest Chat sessions for the POS sidebar red-dot badge. */
export function useGuestChatUnreadCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/staff/unread-count");
      if (!response.ok) return;
      const payload = (await response.json()) as { count?: number };
      if (typeof payload.count === "number") setCount(payload.count);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubAlert = subscribeToGuestChatAlerts(() => {
      void refresh();
    });
    const unsubRows = subscribeToPostgresRowChanges(
      "pos-guest-chat-unread",
      {
        event: "*",
        schema: "public",
        table: "guest_chat_sessions",
      },
      () => {
        void refresh();
      },
      { debounceMs: 250 },
    );
    return () => {
      unsubAlert();
      unsubRows();
    };
  }, [refresh]);

  return count;
}
