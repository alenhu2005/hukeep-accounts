// Bump this to force clients to refresh cached assets.
const CACHE_NAME = 'ledger-v56';

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/base.css',
  './css/layout.css',
  './css/home.css',
  './css/trip-lottery.css',
  './css/forms-controls.css',
  './css/records-history.css',
  './css/analysis.css',
  './css/trip-cards.css',
  './css/members-rare.css',
  './css/trip-forms-collapsible.css',
  './css/shell-nav.css',
  './css/overlays-feedback.css',
  './css/sheets-directory.css',
  './css/dark-a11y.css',
  './css/accent-themes.css',
  './manifest.json',
  './js/main.js',
  './js/bootstrap.js',
  './js/config.js',
  './js/state.js',
  './js/state-accessors.js',
  './js/model.js',
  './js/api.js',
  './js/offline-queue.js',
  './js/data.js',
  './js/data/shared.js',
  './js/data/daily-selectors.js',
  './js/data/history-selectors.js',
  './js/data/member-selectors.js',
  './js/data/trip-selectors.js',
  './js/finance.js',
  './js/time.js',
  './js/utils.js',
  './js/router.js',
  './js/navigation.js',
  './js/render-registry.js',
  './js/globals.js',
  './js/ui-collapsible.js',
  './js/trip-stats-modal.js',
  './js/actions/shared.js',
  './js/actions/home-daily.js',
  './js/actions/trip-form.js',
  './js/trip-cny-rate.js',
  './js/actions/trips-members.js',
  './js/actions/trip-expense.js',
  './js/actions/edit.js',
  './js/actions/misc.js',
  './js/actions.js',
  './js/views-home.js',
  './js/views-trips.js',
  './js/views-trip-detail.js',
  './js/views-analysis.js',
  './js/views-shared.js',
  './js/trip-stats.js',
  './js/trip-lottery.js',
  './js/trip-play-number-bomb.js',
  './js/pie-chart.js',
  './js/category.js',
  './js/theme.js',
  './js/accent-theme.js',
  './js/dialog.js',
  './js/dialog-a11y.js',
  './js/amount-input.js',
  './js/backup.js',
  './js/trip-closure-report-modal.js',
  './js/sync-ui.js',
  './js/sync-pause.js',
  './js/session-ui.js',
  './js/device-info.js',
  './js/sync/merge.js',
  './js/sync/pending.js',
  './js/sync/outbox-storage.js',
  './js/sync/storage-schema.js',
  './js/views-trip-detail/records.js',
  './js/views-trip-detail/settlement.js',
  './js/views-trip-detail/history.js',
  './js/views-trip-detail/orchestration.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetching = fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetching;
    }),
  );
});
