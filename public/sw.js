/* koku service worker — installability, offline app shell, and local notifications.
 *
 * koku is local-first (data lives in IndexedDB), so this worker does not do web
 * push: there is no server and no account to push from. It exists for two
 * reasons:
 *
 *   1. Installability + an offline app shell.
 *        - Navigations: network-first, falling back to the cached shell offline.
 *        - Static assets (/_next/static, icons): stale-while-revalidate.
 *        - Everything else (APIs, cross-origin): passed straight through.
 *      It never caches API responses, so AI/bring-your-own-key requests always
 *      hit the network.
 *
 *   2. Notification action buttons. `new Notification()` cannot render actions —
 *      only `ServiceWorkerRegistration.showNotification()` can — so koku's
 *      check-in reminders have to be shown through this worker, and their button
 *      clicks arrive here as `notificationclick`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ The string literals below ("quick-note", "notification-action", …) are    │
 * │ duplicated from src/lib/notifications/messages.ts, which cannot be        │
 * │ imported here. src/lib/notifications/messages.test.ts asserts that every  │
 * │ one of them still appears in this file, so renaming them in TypeScript     │
 * │ without updating this worker fails the test suite rather than silently     │
 * │ breaking notifications.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const CACHE = "koku-shell-v2";
const APP_SHELL = ["/dashboard", "/icon-192.png", "/icon-512.png"];
const INTENT_PARAM = "koku-intent";

/* ┌────────────────────────────────────────────────────────────────────────────┐
 * │ DEVELOPMENT BYPASS — do not remove.                                        │
 * │                                                                            │
 * │ The worker must be registered in dev too, because notification actions      │
 * │ require it and would otherwise be untestable outside a production build.    │
 * │ But caching anything in dev serves stale Turbopack chunks and RSC payloads  │
 * │ and breaks HMR. So in dev this worker registers, handles notifications, and │
 * │ intercepts no traffic at all.                                              │
 * │                                                                            │
 * │ `self.location` is this script's own URL including its query string, so     │
 * │ registering `/sw.js?dev=1` is enough to flag it. The hostname check is a    │
 * │ fallback for anyone loading `/sw.js` without the parameter.                 │
 * └────────────────────────────────────────────────────────────────────────────┘ */
const DEV =
  new URL(self.location.href).searchParams.get("dev") === "1" ||
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1";

/* ─── Lifecycle ───────────────────────────────────────────────────────────── */

self.addEventListener("install", (event) => {
  if (DEV) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Deletes every cache that is not the current one, so bumping CACHE is all
  // that is needed to retire a previous shell for returning users.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/* ─── Fetch ───────────────────────────────────────────────────────────────── */

self.addEventListener("fetch", (event) => {
  if (DEV) {
    return;
  }

  const { request } = event;

  // Only handle GET on our own origin; let the browser handle the rest.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Never intercept API traffic — always live.
  if (new URL(request.url).pathname.startsWith("/api/")) {
    return;
  }

  // App navigations: network-first with offline shell fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/dashboard"))),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  const url = new URL(request.url);
  const isStatic = url.pathname.startsWith("/_next/static") || /\.(?:png|svg|ico|webmanifest|css|js|woff2?)$/.test(url.pathname);

  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

/* ─── Notifications ───────────────────────────────────────────────────────── */

async function broadcast(message) {
  const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clientList) {
    client.postMessage(message);
  }
}

/**
 * Focuses an existing koku window and tells it what the user asked for.
 *
 * `includeUncontrolled` matters: in dev, and on the very first load before
 * `clients.claim()` has taken effect, a koku tab may not yet be controlled by
 * this worker but is still a perfectly good target.
 *
 * Focus happens *before* postMessage so the quick-note composer is on screen by
 * the time the page reacts. If no window exists at all we cannot postMessage —
 * a brand-new document has no listener yet — so the intent travels in the URL
 * and the page picks it up on mount.
 */
async function routeIntent(intent, notification) {
  const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const target = clientList.find((client) => client.focused) || clientList[0];

  if (target) {
    try {
      await target.focus();
    } catch {
      /* focus can be refused; still deliver the intent */
    }

    target.postMessage({
      source: "koku-sw",
      type: "notification-action",
      action: intent,
      tag: notification.tag,
      data: notification.data || null,
    });
    return;
  }

  await self.clients.openWindow(`/log?${INTENT_PARAM}=${intent}`);
}

self.addEventListener("notificationclick", (event) => {
  const { notification } = event;
  // An empty `action` means the notification body was clicked, which is the only
  // path available on browsers that do not render action buttons.
  const action = event.action || "open-log";

  notification.close();

  if (action === "eod-stop") {
    event.waitUntil(
      broadcast({ source: "koku-sw", type: "eod-stop-timers" }),
    );
    return;
  }

  if (action === "eod-keep") {
    event.waitUntil(
      broadcast({ source: "koku-sw", type: "eod-keep-running" }),
    );
    return;
  }

  if (action === "dismiss") {
    event.waitUntil(
      broadcast({ source: "koku-sw", type: "notification-dismissed", tag: notification.tag }),
    );
    return;
  }

  const intent = action === "quick-note" ? "quick-note" : "open-log";
  event.waitUntil(routeIntent(intent, notification));
});

self.addEventListener("notificationclose", (event) => {
  event.waitUntil(
    broadcast({ source: "koku-sw", type: "notification-closed", tag: event.notification.tag }),
  );
});

/* ─── Page → worker messages ──────────────────────────────────────────────── */
/* Note there is deliberately no "show-notification" message: the page holds the  */
/* registration and calls showNotification() directly. Less protocol to keep in   */
/* sync, and one fewer place for a notification to get lost.                      */

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.source !== "koku") {
    return;
  }

  if (data.type === "skip-waiting") {
    self.skipWaiting();
    return;
  }

  if (data.type === "ping") {
    if (event.source) {
      event.source.postMessage({ source: "koku-sw", type: "pong" });
    }
    return;
  }

  if (data.type === "close-notifications") {
    // Used when enabling DND, or when a timer stops, so a check-in that is no
    // longer true does not sit in the tray.
    event.waitUntil(
      self.registration
        .getNotifications({ tag: data.tag })
        .then((notifications) => notifications.forEach((notification) => notification.close())),
    );
  }
});
