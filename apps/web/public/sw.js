// Forkd service worker — app-shell offline support (v1, hand-rolled, no deps).
// Scope: served from the web root, so it controls the whole origin.
//
// Strategy:
//   - navigations: network-first, fall back to the cached offline page when down.
//   - static assets (/_next/static, icons, manifest, fonts): stale-while-revalidate.
//   - everything else (tRPC, /api/*, photo bytes): straight to network, never cached
//     (keeps data fresh and avoids caching anything behind Cloudflare Access).

const CACHE = "forkd-shell-v1";
const PRECACHE = ["/offline.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("forkd-shell-") && k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:js|css|woff2?|ttf|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network, fall back to the offline page.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  // Static assets: serve from cache immediately, refresh in the background.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((resp) => {
              if (resp && resp.ok) cache.put(request, resp.clone());
              return resp;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
  }

  // Anything else (API/tRPC/photos): default network handling, never cached.
});
