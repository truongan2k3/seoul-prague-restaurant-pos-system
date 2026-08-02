"use client";

import { Bell } from "lucide-react";
import { useNotifications } from "@/contexts/notification-context";
import { unlockNotificationAudio } from "@/lib/notification-sound";

export function NotificationBell() {
  const { unreadCount, openDrawer } = useNotifications();

  return (
    <button
      type="button"
      onClick={() => {
        unlockNotificationAudio();
        openDrawer();
      }}
      className="relative rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
      aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
