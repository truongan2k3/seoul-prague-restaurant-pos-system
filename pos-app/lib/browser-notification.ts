/** Browser Notification helpers for POS reservation alerts. */

let permissionRequested = false;

export function canUseBrowserNotifications(): boolean {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

/** Ask once (best-effort). Mobile browsers usually need a tap first. */
export function ensureBrowserNotificationPermission(): void {
  if (!canUseBrowserNotifications()) return;
  if (Notification.permission !== "default") return;
  if (permissionRequested) return;
  permissionRequested = true;
  void Notification.requestPermission().catch(() => {
    /* ignore */
  });
}

/**
 * Show an OS/browser notification when allowed.
 * Note: many phones only deliver these while the POS tab is open (or as an installed PWA on iOS).
 * In-app popup/toast still fire via the reservation listener.
 */
export function showBrowserNotification(input: {
  title: string;
  body: string;
  tag?: string;
}): void {
  if (!canUseBrowserNotifications()) return;
  if (Notification.permission !== "granted") return;

  const showViaRegistration = async () => {
    if (!("serviceWorker" in navigator)) return false;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg?.showNotification) return false;
      await reg.showNotification(input.title, {
        body: input.body,
        tag: input.tag,
        data: { url: typeof window !== "undefined" ? window.location.href : undefined },
      });
      return true;
    } catch {
      return false;
    }
  };

  void (async () => {
    const viaSw = await showViaRegistration();
    if (viaSw) return;
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
      /* iOS Safari / locked WebView may throw even when permission is granted. */
    }
  })();
}
