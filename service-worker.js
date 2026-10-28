// Cache names are scoped to this repository path. This prevents a new
// GitHub Pages repository from deleting or reusing another 52nd Watch app's
// cache on the same github.io origin.
const CACHE_SCOPE_ID = new URL(self.registration.scope).pathname
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "") || "root";
const CACHE_PREFIX = `p52scope-${CACHE_SCOPE_ID}-`;
const CACHE_NAME = `${CACHE_PREFIX}winter-arc-invicticus-v2-1-oct30-2026-r1`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./app-cover.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const fetchAndCache = async () => {
    const response = await fetch(event.request);
    if (response && response.status === 200) {
      const copy = response.clone();
      await caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  };

  if (event.request.mode === "navigate") {
    event.respondWith(fetchAndCache().catch(async () => (
      await caches.match(event.request)
      || await caches.match("./index.html")
      || Response.error()
    )));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetchAndCache()));
});
