// Service Worker for Web Push (M10-05). Served at `${BASE_URL}sw.js` — relative URLs below
// resolve against that location, so they stay correct whether BASE_PATH is "" (dev) or
// "/smyoutask" (prod) without any build-time templating.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "SMYou Pro";
  const options = {
    body: data.body || "",
    icon: "favicon.svg",
    data: { entityType: data.entity_type, entityId: data.entity_id },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const basePath = new URL(self.registration.scope).pathname;
  const entityId = event.notification.data && event.notification.data.entityId;
  const url = entityId ? `${basePath}orders/${entityId}` : basePath;

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((windows) => {
      const existing = windows.find((client) => client.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
