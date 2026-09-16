const CACHE_PREFIX = `sogrim-${self.registration.scope}-`;
const LEGACY_CACHE_PREFIX = 'table-close-';
const CACHE_NAME = `${CACHE_PREFIX}8e7b7fe3d62a`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/app.js',
  './assets/settlement.js',
  './assets/styles.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => (
          (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          || cacheName.startsWith(LEGACY_CACHE_PREFIX)
        ))
        .map((cacheName) => caches.delete(cacheName)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return cache.match(new URL('./index.html', self.registration.scope));
        }),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(async (response) => {
        if (response.ok) {
          await cache.put(event.request, response.clone());
        }
        return response;
      });
    }),
  );
});
