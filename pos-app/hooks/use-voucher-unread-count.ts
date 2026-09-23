"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeToVoucherOrderAlerts } from "@/lib/voucher-order-alert";

const SEEN_AT_KEY = "pos-voucher-seen-at";

function readSeenAt(): string {
  if (typeof window === "undefined") return new Date(0).toISOString();
  try {
    return localStorage.getItem(SEEN_AT_KEY) || new Date(0).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

export function markVouchersSeenNow(): void {
  try {
    localStorage.setItem(SEEN_AT_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

/** Unread pending voucher orders for the POS sidebar badge. */
export function useVoucherUnreadCount(activeTabIsVouchers = false) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const since = readSeenAt();
      const response = await fetch(
        `/api/vouchers/staff/unread-count?since=${encodeURIComponent(since)}`,
      );
      if (!response.ok) return;
      const payload = (await response.json()) as { count?: number };
      if (typeof payload.count === "number") setCount(payload.count);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (activeTabIsVouchers) {
      markVouchersSeenNow();
      setCount(0);
    }
  }, [activeTabIsVouchers]);

  useEffect(() => {
    void refresh();
    const unsub = subscribeToVoucherOrderAlerts(() => {
      void refresh();
    });
    return () => {
      unsub();
    };
  }, [refresh]);

  return count;
}
