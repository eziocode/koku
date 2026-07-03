/* koku service worker — installability + offline app shell.
 *
 * koku is local-first (data lives in IndexedDB), so the service worker only
 * needs to make the app installable and keep the shell working offline. It
 * uses a conservative strategy:
 *   - Navigations: network-first, falling back to the cached shell offline.
 *   - Static assets (/_next/static, icons): stale-while-revalidate.
 *   - Everything else (APIs, cross-origin): passed straight through.
 * It never caches API responses, so AI/bring-your-own-key requests always hit
 * the network.
 */

const CACHE = "koku-shell-v1";
const APP_SHELL = ["/dashboard", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
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
