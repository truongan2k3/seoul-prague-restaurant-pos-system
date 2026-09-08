/** Browser Notification helpers for POS reservation alerts. */

let permissionRequested = false;

export function canUseBrowserNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Ask once (best-effort). Browsers may still require a user gesture. */
export function ensureBrowserNotificationPermission(): void {
  if (!canUseBrowserNotifications()) return;
  if (Notification.permission !== "default") return;
  if (permissionRequested) return;
  permissionRequested = true;
  void Notification.requestPermission().catch(() => {
    /* ignore */
  });
}

export function showBrowserNotification(input: {
  title: string;
  body: string;
  tag?: string;
}): void {
  if (!canUseBrowserNotifications()) return;
  if (Notification.permission !== "granted") return;

  try {
    const notification = new Notification(input.title, {
      body: input.body,
      tag: input.tag,
    });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      notification.close();
    };
  } catch {
    /* Some browsers throw if the document is not visible / permission revoked. */
  }
}
