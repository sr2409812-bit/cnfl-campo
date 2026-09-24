const CACHE_NAME = 'cnfl-campo-v20';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './telegram-fix.js',
  './route-optimizer.js',
  './orders_today.json',
  './resolved_cache.json',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW v20] Pre-caching assets offline...');

      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn('[SW] Cache addAll warning:', err));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method === 'GET' && event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
          });
        }
        return networkResponse;
      });
    })
  );
});
