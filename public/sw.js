const VERSION = "camel-paper-pwa-v1";

const APP_CACHE = `${VERSION}-app`;
const PAGE_CACHE = `${VERSION}-pages`;
const ASSET_CACHE = `${VERSION}-assets`;
const IMAGE_CACHE = "camel-paper-catalog-images-v1";

const APP_SHELL = [
  "/",
  "/catalogo",
  "/manifest.webmanifest",
  "/brand/camel-paper-logo.png",
  "/brand/camel-colorido.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);

      await Promise.allSettled(
        APP_SHELL.map(async (url) => {
          const response = await fetch(url, { cache: "reload" });
          if (response.ok) {
            await cache.put(url, response);
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const allowed = new Set([
        APP_CACHE,
        PAGE_CACHE,
        ASSET_CACHE,
        IMAGE_CACHE,
      ]);

      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName.startsWith("camel-paper-pwa-") &&
            !allowed.has(cacheName)
          ) {
            return caches.delete(cacheName);
          }

          return Promise.resolve(false);
        })
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/catalog-image") {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|webp|svg|ico)$/.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    return new Response("", {
      status: 504,
      statusText: "Offline",
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => undefined);
    return cached;
  }

  const response = await networkPromise;

  if (response) return response;

  return new Response("", {
    status: 504,
    statusText: "Offline",
  });
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    const exact = await cache.match(request);
    if (exact) return exact;

    const appCache = await caches.open(APP_CACHE);

    if (request.url.includes("/catalogo/")) {
      const catalogFallback = await appCache.match("/catalogo");
      if (catalogFallback) return catalogFallback;
    }

    const rootFallback = await appCache.match("/");
    if (rootFallback) return rootFallback;

    return new Response(
      "<!doctype html><html lang='pt-BR'><meta charset='utf-8'><title>Offline</title><body style='font-family:system-ui;padding:32px;background:#f6f2ee;color:#261c18'><h1>Sem conexão</h1><p>Abra o Catálogo do Vendedor quando a conexão voltar e use “Atualizar conteúdo offline”.</p></body></html>",
      {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
}
