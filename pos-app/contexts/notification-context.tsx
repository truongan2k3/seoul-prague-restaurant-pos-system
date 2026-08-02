"use client";

import { Bell, Check, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { playCustomAlertSound, unlockNotificationAudio } from "@/lib/notification-sound";
import { useSettings } from "@/contexts/settings-context";

const TOAST_DURATION_MS = 10_000;
const MAX_HISTORY = 100;

export interface SessionNotification {
  id: string;
  message: string;
  staffName?: string;
  createdAt: Date;
  read: boolean;
}

export interface PushNotificationInput {
  id?: string;
  message: string;
  staffName?: string;
  playSound?: boolean | "ready" | "newOrder";
}

interface NotificationContextValue {
  history: SessionNotification[];
  unreadCount: number;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  markAllRead: () => void;
  pushNotification: (input: PushNotificationInput) => void;
  /** @deprecated Use pushNotification */
  pushToast: (input: { id?: string; message: string }) => void;
  dismissToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

interface ActiveToast {
  id: string;
  message: string;
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ActiveToast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed top-16 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-lg ring-1 ring-emerald-500/20 dark:border-emerald-800 dark:bg-gray-800 dark:ring-emerald-500/30"
        >
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Check className="h-4 w-4" aria-hidden />
          </div>
          <p className="min-w-0 flex-1 pt-1 text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">
            {toast.message}
          </p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function NotificationDrawer({
  open,
  history,
  onClose,
  onMarkAllRead,
}: {
  open: boolean;
  history: SessionNotification[];
  onClose: () => void;
  onMarkAllRead: () => void;
}) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close notifications"
        onClick={onClose}
        className="fixed inset-0 z-[90] bg-black/40"
      />
      <aside
        className="fixed inset-y-0 right-0 z-[95] flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        role="dialog"
        aria-modal="true"
        aria-label="Notification history"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Notifications</h2>
          <div className="flex items-center gap-2">
            {history.some((n) => !n.read) && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto p-4">
          {history.length === 0 ? (
            <li className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              No notifications this session yet.
            </li>
          ) : (
            history.map((entry) => (
              <li
                key={entry.id}
                className={`mb-2 rounded-xl border px-4 py-3 ${
                  entry.read
                    ? "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
                    : "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/30"
                }`}
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{entry.message}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {entry.createdAt.toLocaleTimeString()}
                  {entry.staffName && ` · ${entry.staffName}`}
                </p>
              </li>
            ))
          )}
        </ul>
      </aside>
    </>
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [history, setHistory] = useState<SessionNotification[]>([]);
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const unreadCount = useMemo(() => history.filter((n) => !n.read).length, [history]);

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushNotification = useCallback(
    ({ id, message, staffName, playSound = "ready" }: PushNotificationInput) => {
      const notificationId = id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setHistory((prev) =>
        [
          {
            id: notificationId,
            message,
            staffName,
            createdAt: new Date(),
            read: false,
          },
          ...prev.filter((n) => n.id !== notificationId),
        ].slice(0, MAX_HISTORY),
      );

      setToasts((prev) => {
        const withoutDuplicate = prev.filter((toast) => toast.id !== notificationId);
        return [{ id: notificationId, message }, ...withoutDuplicate].slice(0, 6);
      });

      const existingTimer = timersRef.current.get(notificationId);
      if (existingTimer) clearTimeout(existingTimer);
      timersRef.current.set(
        notificationId,
        setTimeout(() => dismissToast(notificationId), TOAST_DURATION_MS),
      );

      if (playSound === "newOrder") {
        playCustomAlertSound(settings.customAlertSoundUrl, "newOrder");
      } else if (playSound !== false) {
        playCustomAlertSound(settings.customAlertSoundUrl, "ready");
      }
    },
    [dismissToast, settings.customAlertSoundUrl],
  );

  const pushToast = useCallback(
    (input: { id?: string; message: string }) => {
      pushNotification({ ...input, playSound: false });
    },
    [pushNotification],
  );

  const markAllRead = useCallback(() => {
    setHistory((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const openDrawer = useCallback(() => {
    unlockNotificationAudio();
    setDrawerOpen(true);
    markAllRead();
  }, [markAllRead]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    const unlock = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      history,
      unreadCount,
      drawerOpen,
      openDrawer,
      closeDrawer,
      markAllRead,
      pushNotification,
      pushToast,
      dismissToast,
    }),
    [
      history,
      unreadCount,
      drawerOpen,
      openDrawer,
      closeDrawer,
      markAllRead,
      pushNotification,
      pushToast,
      dismissToast,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <NotificationDrawer
        open={drawerOpen}
        history={history}
        onClose={closeDrawer}
        onMarkAllRead={markAllRead}
      />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}

/** @deprecated Use useNotifications */
export function useToast() {
  return useNotifications();
}
