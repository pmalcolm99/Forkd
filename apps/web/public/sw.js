// Forkd service worker — app-shell offline support (v2, hand-rolled, no deps).
// Scope: served from the web root, so it controls the whole origin.
//
// Strategy:
//   - navigations: network-first (via navigation preload), fall back to the cached
//     offline page when offline.
//   - immutable build assets (/_next/static/) + the precached shell: cache-first,
//     no revalidation — these URLs are content-hashed so a cache hit is always valid.
//   - everything else (tRPC, /api/*, photo bytes, RSC payloads): straight to the
//     network, never cached (keeps data fresh, avoids caching per-user/photo bytes,
//     and avoids doubling requests over the tunnel).

const CACHE = "forkd-shell-v2";
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
    (async () => {
      // Network-preload navigations so the SW doesn't block streaming.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("forkd-shell-") && k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Only content-hashed build assets and the explicitly precached shell are cacheable.
// Everything dynamic (photos under /api/v1/photos, tRPC, RSC) is intentionally excluded.
function isCacheableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: prefer the preloaded response, then the network, then offline.html.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) return preloaded;
          return await fetch(request);
        } catch {
          return (await caches.match("/offline.html")) ?? Response.error();
        }
      })()
    );
    return;
  }

  // Immutable assets: cache-first (no background revalidation needed — hashed URLs).
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const resp = await fetch(request);
        if (resp && resp.ok) cache.put(request, resp.clone());
        return resp;
      })
    );
    return;
  }

  // Anything else (tRPC, /api/*, photos, RSC): default network handling, never cached.
});
