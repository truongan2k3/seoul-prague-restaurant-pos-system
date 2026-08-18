"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { useUnsavedWork } from "@/contexts/unsaved-work-context";
import {
  notifyPosDataSynced,
  requestPosSoftRefresh,
  subscribePosDataSynced,
} from "@/lib/pos-refresh";

const PULL_THRESHOLD_PX = 72;
const MAX_PULL_PX = 120;

function isMobileTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
}

function pageScrollTop(): number {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export function MobileRefreshGuard() {
  const { translate } = useApp();
  const { pushNotification } = useNotifications();
  const { hasUnsavedWork, getDirtyEntries } = useUnsavedWork();
  const hasUnsavedRef = useRef(hasUnsavedWork);
  const getDirtyRef = useRef(getDirtyEntries);

  const [pullPx, setPullPx] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const touchStartY = useRef(0);
  const trackingPull = useRef(false);
  const pullActive = useRef(false);
  const pullPxRef = useRef(0);

  useEffect(() => {
    hasUnsavedRef.current = hasUnsavedWork;
  }, [hasUnsavedWork]);

  useEffect(() => {
    getDirtyRef.current = getDirtyEntries;
  }, [getDirtyEntries]);

  const runSoftRefresh = useCallback(() => {
    requestPosSoftRefresh();
    notifyPosDataSynced();
  }, []);

  const openRefreshDialog = useCallback(() => {
    setPullPx(0);
    setDialogOpen(true);
  }, []);

  const performRefresh = useCallback(async (saveFirst: boolean) => {
    setBusy(true);
    try {
      if (saveFirst) {
        const dirty = getDirtyRef.current();
        for (const entry of dirty) {
          if (!entry.onSave) continue;
          const result = await entry.onSave();
          if (result === false) return;
        }
      }
      setDialogOpen(false);
      runSoftRefresh();
    } finally {
      setBusy(false);
    }
  }, [runSoftRefresh]);

  useEffect(() => {
    if (!isMobileTouchDevice()) return;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || pageScrollTop() > 2) {
        trackingPull.current = false;
        return;
      }
      trackingPull.current = true;
      touchStartY.current = event.touches[0]?.clientY ?? 0;
      pullActive.current = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!trackingPull.current || event.touches.length !== 1) return;
      if (pageScrollTop() > 2) {
        trackingPull.current = false;
        setPullPx(0);
        return;
      }

      const delta = (event.touches[0]?.clientY ?? 0) - touchStartY.current;
      if (delta <= 0) {
        pullActive.current = false;
        setPullPx(0);
        return;
      }

      pullActive.current = true;
      event.preventDefault();
      const next = Math.min(delta, MAX_PULL_PX);
      pullPxRef.current = next;
      setPullPx(next);
    };

    const onTouchEnd = () => {
      if (!trackingPull.current) return;
      trackingPull.current = false;
      const shouldRefresh = pullActive.current && pullPxRef.current >= PULL_THRESHOLD_PX;
      pullActive.current = false;
      pullPxRef.current = 0;
      setPullPx(0);
      if (shouldRefresh) {
        openRefreshDialog();
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [openRefreshDialog]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedRef.current()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    return subscribePosDataSynced(() => {
      pushNotification({ message: translate("posDataSynced"), playSound: false });
    });
  }, [pushNotification, translate]);

  const dirty = dialogOpen && hasUnsavedWork();
  const pullProgress = Math.min(1, pullPx / PULL_THRESHOLD_PX);

  return (
    <>
      {pullPx > 8 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center pt-[max(0.5rem,env(safe-area-inset-top))]"
          style={{ opacity: 0.35 + pullProgress * 0.65 }}
        >
          <div className="rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm dark:border-gray-600 dark:bg-gray-900/95 dark:text-gray-200">
            {pullProgress >= 1 ? translate("refreshPullRelease") : translate("refreshPullHint")}
          </div>
        </div>
      )}

      {dialogOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div aria-hidden="true" className="absolute inset-0 bg-black/50" />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="refresh-guard-title"
            className="relative z-10 w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          >
            <p
              id="refresh-guard-title"
              className="text-sm leading-relaxed text-gray-800 dark:text-gray-100"
            >
              {dirty ? translate("refreshConfirmDirtyTitle") : translate("refreshConfirmTitle")}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {dirty && getDirtyEntries().some((entry) => entry.onSave) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void performRefresh(true)}
                  className="rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {translate("refreshConfirmSave")}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void performRefresh(false)}
                className="rounded-xl bg-zinc-800 py-2.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-zinc-200 dark:text-zinc-900"
              >
                {dirty ? translate("refreshConfirmDiscard") : translate("refreshConfirmRefresh")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialogOpen(false)}
                className="rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                {translate("refreshConfirmCancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
