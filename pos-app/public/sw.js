self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Always display received push. An open website tab does not prove that the
 * POS Realtime listener is connected or has processed this event.
 */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {
        title: "POS update",
        body: "",
        tag: "pos",
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

      await self.registration.showNotification(payload.title || "POS update", {
        body: payload.body || "",
        tag: payload.tag || "pos",
        // Foreground and background deliveries share tags: replace quietly
        // rather than alerting twice for the same reservation/message.
        renotify: false,
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
