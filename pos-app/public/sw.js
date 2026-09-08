self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Show OS notification only when no POS tab is visibly focused.
 * Open tabs already show in-app popup/toast via Realtime.
 */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {
        title: "Reservation update",
        body: "",
        tag: "reservation",
        url: "/app",
      };
      try {
        if (event.data) {
          payload = { ...payload, ...event.data.json() };
        }
      } catch {
        try {
          payload.body = event.data ? event.data.text() : "";
        } catch {
          /* ignore */
        }
      }

      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const hasVisible = windows.some((client) => {
        // focused + visible tab → in-app UI handles it
        return client.visibilityState === "visible" && "focused" in client
          ? client.focused !== false
          : client.visibilityState === "visible";
      });
      if (hasVisible) return;

      await self.registration.showNotification(payload.title || "Reservation update", {
        body: payload.body || "",
        tag: payload.tag || "reservation",
        renotify: true,
        data: { url: payload.url || "/app" },
        vibrate: [120, 60, 120],
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/app";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            try {
              await client.navigate(targetUrl);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
