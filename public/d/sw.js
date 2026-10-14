/* Ф8 door helper — service worker, scope /d/ only (the rest of the site has none).
 * The helper opens /d/{token} once with internet; after that the page works offline:
 * - the page (navigation) — network first, the cached copy when offline;
 * - /_next/static, /fonts, /icons.svg — cache first (hashed / immutable);
 * - /api/door/* — never cached here (the page keeps data in IndexedDB and syncs itself).
 * The page sends `{type: "precache", urls}` after the first load: everything it already loaded goes into the cache,
 * because those requests happened before this worker controlled the page. Background Sync is not used (iOS).
 */
const CACHE = "toi-door-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const d = event.data;
  if (!d || d.type !== "precache" || !Array.isArray(d.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const u of d.urls) {
        try {
          const url = new URL(u, self.location.origin);
          if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) continue;
          if (!(await cache.match(url.href))) {
            const res = await fetch(url.href, { credentials: "same-origin" });
            if (res.ok) await cache.put(url.href, res);
          }
        } catch {
          // offline or blocked: try next time
        }
      }
    })(),
  );
});

const immutable = (p) => p.startsWith("/_next/static/") || p.startsWith("/fonts/") || p === "/icons.svg";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate" && url.pathname.startsWith("/d/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const key = url.origin + url.pathname;
        try {
          const res = await fetch(req);
          if (res.ok) await cache.put(key, res.clone());
          return res;
        } catch {
          return (await cache.match(key)) || Response.error();
        }
      })(),
    );
    return;
  }
  if (immutable(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req.url);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) await cache.put(req.url, res.clone());
        return res;
      })(),
    );
  }
});
