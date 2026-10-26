const CACHE_NAME = 'cnfl-campo-v39';

const CORE_ASSETS = [
  './',
  './campo.html',
  './campo.css',
  './campo-shell.css',
  './campo-shell.js',
  './data-store.js',
  './index.html',
  './style.css',
  './app.js',
  './telegram-fix.js',
  './route-optimizer.js',
  './orders_today.json',
  './manifest.json',
  './lectura.html',
  './lectura.css',
  './lectura.js',
  './lectura-pdf.js',
  './lectura-pdf-v3.js',
  './lectura-pdf-v4.js',
  './lectura-map.js',
  './lectura-pdf-hotfix.js',
  './lectura-residential-flow.js',
  './lectura-pdf-v2.js',
  './lectura-ux.js',
  './lectura-residencial.html',
  './notificaciones.html',
  './backup.html',
  './backup.js'
];

const OPTIONAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Los archivos propios son críticos: se cachean uno por uno para que
    // una falla aislada no deje toda la app sin modo offline.
    for (const asset of CORE_ASSETS) {
      try { await cache.add(asset); }
      catch (err) { console.warn('[SW v39] No se pudo precachear', asset, err); }
    }

    // Dependencias externas son opcionales: no bloquean la instalación.
    for (const asset of OPTIONAL_ASSETS) {
      try { await cache.add(asset); }
      catch (err) { console.warn('[SW v39] Dependencia externa no disponible', asset); }
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function sameOriginPath(request) {
  try {
    const url = new URL(request.url);
    return url.origin === self.location.origin ? url.pathname : '';
  } catch (_) {
    return '';
  }
}

async function cachedIgnoringQuery(request) {
  const cache = await caches.open(CACHE_NAME);
  const direct = await cache.match(request, {ignoreSearch:true});
  if (direct) return direct;

  const path = sameOriginPath(request);
  if (!path) return null;
  const scopePath = new URL(self.registration.scope).pathname;
  const relative = './' + path.slice(scopePath.length);
  return cache.match(relative, {ignoreSearch:true});
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const sameOrigin = event.request.url.startsWith(self.location.origin);

  if (sameOrigin) {
    event.respondWith((async () => {
      try {
        const network = await fetch(event.request, {cache:'no-store'});
        if (network && network.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, network.clone()).catch(()=>{});
        }
        return network;
      } catch (_) {
        const cached = await cachedIgnoringQuery(event.request);
        if (cached) return cached;

        // Nunca mandar Lectura/Demanda/Notificaciones a Cortes por error.
        // Solo la raíz genérica cae al inicio unificado.
        const acceptsHtml = (event.request.headers.get('accept') || '').includes('text/html');
        if (acceptsHtml) {
          const path = sameOriginPath(event.request);
          const scopePath = new URL(self.registration.scope).pathname;
          const relative = path.slice(scopePath.length);
          if (!relative || relative === '/') {
            return caches.match('./campo.html');
          }
        }
        return new Response('Recurso no disponible sin conexión.', {status:503, statusText:'Offline'});
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request, {ignoreSearch:true});
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (_) { return new Response('', {status:503, statusText:'Offline'}); }
  })());
});
