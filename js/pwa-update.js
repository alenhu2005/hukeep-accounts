let reloadingForServiceWorker = false;

function ensureUpdatePrompt(registration) {
  let el = document.getElementById('pwa-update-prompt');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pwa-update-prompt';
    el.className = 'pwa-update-prompt';
    el.innerHTML = `
      <span class="pwa-update-prompt__text">有新版本</span>
      <button type="button" class="pwa-update-prompt__btn">更新</button>
    `;
    document.body.appendChild(el);
  }
  el.querySelector('button')?.addEventListener(
    'click',
    () => {
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    },
    { once: true },
  );
  el.classList.add('is-visible');
}

function watchInstallingWorker(registration) {
  const worker = registration.installing;
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      ensureUpdatePrompt(registration);
    }
  });
}

export function initPwaUpdateFlow() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForServiceWorker) return;
    reloadingForServiceWorker = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', document.baseURI).toString();
    navigator.serviceWorker
      .register(swUrl)
      .then(registration => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          ensureUpdatePrompt(registration);
        }
        registration.addEventListener('updatefound', () => watchInstallingWorker(registration));
        try {
          registration.update();
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  });
}
