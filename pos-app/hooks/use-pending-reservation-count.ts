"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPendingReservationCount } from "@/src/lib/settings-actions";
import { subscribeToReservationChanges } from "@/src/lib/reservation-actions";

export function usePendingReservationCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const { count: pendingCount, error } = await fetchPendingReservationCount();
    if (!error) setCount(pendingCount);
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeToReservationChanges({ onChange: () => void refresh() });
  }, [refresh]);

  return count;
}
