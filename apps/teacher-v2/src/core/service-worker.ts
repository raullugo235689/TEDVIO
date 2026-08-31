const UPDATE_KEY = 'tedvio.phase6.service_worker_updated';

export function registerTedvioServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        registration.update().catch(() => undefined);

        if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage('SKIP_WAITING');
            }
          });
        });
      })
      .catch((error) => console.warn('TEDVIO service worker', error));
  }, { once: true });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    try {
      sessionStorage.setItem(UPDATE_KEY, new Date().toISOString());
    } catch {
      // El marcador es informativo y no bloquea la aplicación.
    }
  });
}
