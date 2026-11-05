import { getOptimizedCatalogImageUrl } from "./catalog-image-policy";

export const OFFLINE_IMAGE_CACHE = "camel-paper-catalog-images-v1";
const SIZES = [[420, 72], [520, 74], [220, 70], [1200, 82]] as const;
const REQUEST_TIMEOUT = 25_000;
const TOTAL_TIMEOUT = 5 * 60_000;

export function imageCopies(source: string) {
  return [...new Set(SIZES.map(([width, quality]) =>
    getOptimizedCatalogImageUrl(source, width, quality)
  ))];
}

function isImage(response?: Response) {
  return Boolean(response?.ok &&
    response.headers.get("content-type")?.startsWith("image/"));
}

export async function hasOfflineImages(urls?: string[]) {
  if (!urls || !("caches" in window)) return false;
  const appCache = await caches.open("camel-paper-pwa-v1-app");
  const shell = await appCache.match("/catalogo", { ignoreVary: true });
  if (shell?.headers.get("X-Camel-Offline-Shell") !== "3") return false;
  const cache = await caches.open(OFFLINE_IMAGE_CACHE);
  for (const url of urls) {
    if (!isImage(await cache.match(url, { ignoreVary: true }))) return false;
  }
  return true;
}

export async function ensureOfflineWorker() {
  if (!("serviceWorker" in navigator) || !("caches" in window)) {
    throw new Error("Este navegador não oferece o armazenamento offline necessário.");
  }
  // Não aguarda indefinidamente um registro bloqueado pelo login ou pela rede.
  const setup = async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const deadline = Date.now() + 18_000;
    while (Date.now() < deadline) {
      const worker = navigator.serviceWorker.controller;
      if (worker) {
        const ready = await new Promise<boolean>((resolve) => {
          const channel = new MessageChannel();
          const finish = (value: boolean) => {
            clearTimeout(timer);
            channel.port1.close();
            resolve(value);
          };
          const timer = setTimeout(() => finish(false), 1000);
          channel.port1.onmessage = (event) => finish(event.data?.version === 3);
          worker.postMessage({ type: "CAMEL_OFFLINE_STATUS" }, [channel.port2]);
        });
        if (ready) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("O modo offline ainda está sendo atualizado. Recarregue a página e tente novamente.");
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      setup(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(
          "Não foi possível ativar o modo offline. Recarregue a página com internet."
        )), 20_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function validateImage(response: Response) {
  if (!isImage(response)) throw new Error("O servidor não retornou uma imagem válida.");
  const blob = await response.blob();
  if (!blob.size) throw new Error("A imagem recebida está vazia.");
  const objectUrl = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => {
        image.src = "";
        reject(new Error("Tempo limite ao validar a foto."));
      }, 8000);
      image.onload = () => {
        clearTimeout(timer);
        if (image.naturalWidth > 0) resolve();
        else reject(new Error("A foto não pôde ser aberta."));
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error("A foto recebida está corrompida."));
      };
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  // Sem Vary: Accept: a mesma cópia offline atende fetch e <img>.
  return new Response(blob, {
    status: 200,
    headers: { "Content-Type": blob.type, "Content-Length": String(blob.size) },
  });
}

export async function prepareOfflineImages(
  sources: string[],
  onProgress: (saved: number, total: number, failed: number) => void
) {
  await ensureOfflineWorker();
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      reject(new Error("Tempo limite ao salvar as telas offline. Tente novamente com internet."));
    }, 90_000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.close();
      if (event.data?.ok) resolve();
      else reject(new Error(event.data?.error || "Não foi possível salvar as telas offline."));
    };
    const worker = navigator.serviceWorker.controller;
    if (!worker) {
      clearTimeout(timeout);
      channel.port1.close();
      reject(new Error("Recarregue o catálogo para ativar a atualização offline."));
      return;
    }
    worker.postMessage({ type: "CAMEL_PREPARE_SHELL" }, [channel.port2]);
  });
  const cache = await caches.open(OFFLINE_IMAGE_CACHE);
  const unique = [...new Set(sources.filter(Boolean))];
  for (const source of unique) {
    const url = new URL(source);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "maltmqrwwxifqudbzxjn.supabase.co" ||
      !(url.pathname.startsWith("/storage/v1/object/public/product-images/") ||
        url.pathname.startsWith("/storage/v1/render/image/public/product-images/"))
    ) {
      throw new Error("Há uma foto em uma origem não configurada para uso offline. Revise a origem dessa foto antes de concluir.");
    }
  }
  const manifest = unique.map((source) => {
    const copies = imageCopies(source);
    return copies[copies.length - 1];
  });
  const deadline = Date.now() + TOTAL_TIMEOUT;
  let cursor = 0;
  let saved = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  let stop = false;
  let firstError = "";

  async function saveImage(source: string) {
    const copies = imageCopies(source);
    const fullUrl = copies[copies.length - 1];
    let image: Response | undefined;
    const cached = await cache.match(fullUrl, { ignoreVary: true });
    if (isImage(cached)) {
      try { image = await validateImage(cached!); } catch { /* Baixa novamente. */ }
    }
    if (!image) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
        try {
          const response = await fetch(fullUrl, { signal: controller.signal });
          if (!response.ok) {
            if ([401, 402, 403].includes(response.status)) stop = true;
            throw new Error(`Servidor de imagens respondeu HTTP ${response.status}.`);
          }
          image = await validateImage(response);
          break;
        } catch (error) {
          if (stop || attempt === 1 || Date.now() >= deadline) throw error;
        } finally {
          clearTimeout(timeout);
        }
      }
    }
    if (!image) throw new Error("Foto não recebida.");
    // Uma única cópia por foto. O worker a reutiliza na lista e nas miniaturas.
    await cache.put(fullUrl, image);
  }

  async function worker() {
    while (!stop && Date.now() < deadline) {
      const index = cursor++;
      if (index >= unique.length) return;
      try {
        await saveImage(unique[index]);
        saved++;
        consecutiveFailures = 0;
      } catch (error) {
        failed++;
        consecutiveFailures++;
        if (!firstError) firstError = error instanceof Error ? error.message : "Falha ao salvar foto.";
        if (error instanceof DOMException && error.name === "QuotaExceededError") {
          firstError = "O dispositivo está sem espaço para salvar as fotos offline.";
          stop = true;
        }
        if (consecutiveFailures >= 4) stop = true;
      }
      onProgress(saved, unique.length, failed);
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, worker));
  if (saved !== unique.length) {
    throw new Error(
      `Download incompleto: ${saved} de ${unique.length} fotos salvas. ${firstError || "O tempo de preparação foi atingido."} Tente novamente para continuar; as fotos válidas serão reaproveitadas.`
    );
  }
  if (!(await hasOfflineImages(manifest))) {
    throw new Error("A verificação final encontrou fotos ausentes. Tente atualizar novamente.");
  }
  return { manifest, count: unique.length };
}

