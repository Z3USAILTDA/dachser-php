declare const __APP_VERSION__: string;

const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
const VERSION_KEY = "app_version";

export async function checkAndClearCache(): Promise<void> {
  try {
    // Desregistrar todos os Service Workers ativos no domínio
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log("[CacheControl] Service Worker desregistrado com sucesso.");
      }
    }

    const savedVersion = localStorage.getItem(VERSION_KEY);

    if (savedVersion && savedVersion !== APP_VERSION) {
      console.log(`[CacheControl] Nova versão detectada: ${savedVersion} → ${APP_VERSION}. Limpando cache...`);

      // Clear Service Worker caches
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      // Clear sessionStorage
      sessionStorage.clear();

      // Save new version before reload
      localStorage.setItem(VERSION_KEY, APP_VERSION);

      // Force reload from server
      window.location.reload();
      return;
    }

    if (!savedVersion) {
      console.log(`[CacheControl] Primeira execução. Versão: ${APP_VERSION}`);
    }

    localStorage.setItem(VERSION_KEY, APP_VERSION);
  } catch (error) {
    console.warn("[CacheControl] Erro ao verificar cache:", error);
  }
}
