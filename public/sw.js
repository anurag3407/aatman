// Offline support for the moments that matter (hostel Wi-Fi drops, captive portals):
// - /crisis is precached at install with its CSS/JS, and any failed navigation lands there.
// - Exercise pages are cached when visited (network first), so they work offline afterwards.
// Personal pages (results, history, chat…) are never cached. Bump CACHE when this file's behaviour changes.
const CACHE = "aatman-v2";
const CRISIS_URL = "/crisis";
const RUNTIME_PAGES = [/^\/exercises(\/[\w-]+)?$/];

async function precacheWithAssets(cache, url) {
  const res = await fetch(url, { cache: "reload" });
  if (!res.ok) throw new Error(`Precache of ${url} failed: ${res.status}`);
  const html = await res.clone().text();
  await cache.put(url, res);
  // CSS, JS and font files the page references. Excludes `\` so escaped paths in the RSC payload aren't misread.
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [])];
  await Promise.allSettled(assets.map((a) => cache.add(a)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await precacheWithAssets(cache, CRISIS_URL);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

function networkFirst(request, cacheKey) {
  return fetch(request).then((res) => {
    if (res.ok && !res.redirected) {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(cacheKey, copy));
    }
    return res;
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const cacheable = url.pathname === CRISIS_URL || RUNTIME_PAGES.some((r) => r.test(url.pathname));
    if (cacheable) {
      event.respondWith(
        networkFirst(request, url.pathname).catch(
          async () => (await caches.match(url.pathname)) ?? (await caches.match(CRISIS_URL)) ?? Response.error(),
        ),
      );
      return;
    }
    // Any other page while offline: go to the crisis page rather than a browser error.
    event.respondWith(fetch(request).catch(() => Response.redirect(CRISIS_URL, 302)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    // Hashed, immutable assets: cache first, and remember them for offline pages.
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
});
