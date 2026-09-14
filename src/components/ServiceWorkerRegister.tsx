"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Em desenvolvimento evitamos cache agressivo de chunks do Next.
    if (process.env.NODE_ENV !== "production") return;

    async function registerServiceWorker() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        registration.update().catch(() => undefined);
      } catch (error) {
        console.error("Erro ao registrar Service Worker:", error);
      }
    }

    registerServiceWorker();
  }, []);

  return null;
}
