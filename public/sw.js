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
          if (response.ok && !response.redirected) {
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

  // As fotos do vendedor são servidas diretamente pelo Storage, não pela API.
  const isPublicCatalogImage =
    url.protocol === "https:" &&
    url.hostname === "maltmqrwwxifqudbzxjn.supabase.co" &&
    (url.pathname.startsWith("/storage/v1/render/image/public/product-images/") ||
      url.pathname.startsWith("/storage/v1/object/public/product-images/"));

  if (isPublicCatalogImage) {
    event.respondWith(catalogImage(request));
    return;
  }

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

self.addEventListener("message", (event) => {
  if (event.data?.type === "CAMEL_PREPARE_SHELL") {
    event.waitUntil(prepareCatalogShell().then(
      () => event.ports[0]?.postMessage({ ok: true }),
      (error) => event.ports[0]?.postMessage({ ok: false, error: error.message })
    ));
  }
  if (event.data?.type === "CAMEL_OFFLINE_STATUS") {
    event.ports[0]?.postMessage({ version: 3 });
  }
});

async function fetchRequired(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { cache: "reload", signal: controller.signal });
    if (!response.ok || response.redirected) {
      throw new Error("Não foi possível salvar as telas offline. Confira sua conexão e seu login.");
    }
    // Consome também o corpo dentro do tempo limite.
    const body = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    return new Response(body, { status: response.status, headers });
  } finally { clearTimeout(timeout); }
}

async function prepareCatalogShell() {
  const response = await fetchRequired("/catalogo");
  if (!response.headers.get("content-type")?.includes("text/html")) {
    throw new Error("O catálogo não retornou uma página válida.");
  }
  const html = await response.text();
  const assets = new Set(["/brand/camel-paper-logo.png", "/brand/camel-colorido.svg"]);
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const url = new URL(match[1].replaceAll("&amp;", "&"), self.location.origin);
    if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
      assets.add(url.pathname + url.search);
    }
  }
  if (assets.size <= 2) throw new Error("Os arquivos das telas offline não foram encontrados.");
  const assetCache = await caches.open(ASSET_CACHE);
  const queue = [...assets];
  let index = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (index < queue.length) {
      const url = queue[index++];
      const asset = await fetchRequired(url);
      if (asset.headers.get("content-type")?.includes("text/html")) {
        throw new Error("Um arquivo do catálogo retornou uma página de login ou erro.");
      }
      await assetCache.put(url, asset);
    }
  }));
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("vary");
  headers.set("X-Camel-Offline-Shell", "3");
  const appCache = await caches.open(APP_CACHE);
  await appCache.put("/catalogo", new Response(html, { headers }));
}

async function catalogImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  // Supabase varia por Accept; a cópia validada continua utilizável por <img>.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached?.ok && cached.headers.get("content-type")?.startsWith("image/")) {
    return cached;
  }
  const full = new URL(request.url);
  if (
    full.pathname.startsWith("/storage/v1/render/image/public/product-images/") &&
    [220, 420, 520, 1200].includes(Number(full.searchParams.get("width")))
  ) {
    full.searchParams.set("width", "1200");
    full.searchParams.set("quality", "82");
    const saved = await cache.match(full.toString(), { ignoreVary: true });
    if (saved?.ok && saved.headers.get("content-type")?.startsWith("image/")) {
      return saved;
    }
  }
  try {
    const response = await fetch(request.url, {
      mode: "cors",
      credentials: "omit",
    });
    if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
      // Falta de espaço local não pode impedir uma foto online de aparecer.
      try { await cache.put(request.url, response.clone()); } catch {}
    }
    return response;
  } catch {
    return new Response("", { status: 504, statusText: "Offline" });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);

    if (response.ok && !response.redirected) {
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

    if (response.ok && !response.redirected) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    const appCache = await caches.open(APP_CACHE);
    const pathname = new URL(request.url).pathname;
    if (pathname === "/catalogo" || pathname.startsWith("/catalogo/")) {
      const shell = await appCache.match("/catalogo", { ignoreVary: true });
      if (shell?.headers.get("X-Camel-Offline-Shell") === "3") return shell;
      return new Response("<!doctype html><html lang='pt-BR'><meta charset='utf-8'><title>Atualizar catálogo offline</title><body><h1>Atualize o conteúdo offline</h1><p>Conecte-se à internet, abra o catálogo e clique em Atualizar conteúdo offline para salvar as telas de produtos e checkout.</p></body></html>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    const exact = await cache.match(request);
    if (exact) return exact;

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


